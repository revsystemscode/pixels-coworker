import { describe, expect, it } from 'vitest';
import { TicTacToe, outcomeOf, parseGameMove, parseGameOpen, type Cell } from './tictactoe.js';

const board = (s: string): Cell[] => [...s].map((c) => (c === '.' ? null : (c as Cell)));

describe('outcomeOf', () => {
  it('detecta filas, columnas, diagonales y empates', () => {
    expect(outcomeOf(board('XXX.OO...'))).toEqual({ winner: 'X', line: [0, 1, 2] });
    expect(outcomeOf(board('O.XO.XO..'))).toEqual({ winner: 'O', line: [0, 3, 6] });
    expect(outcomeOf(board('X.O.XO..X'))).toEqual({ winner: 'X', line: [0, 4, 8] });
    expect(outcomeOf(board('XOXXOOOXX'))).toEqual({ winner: 'draw' });
    expect(outcomeOf(board('XO.......'))).toBeNull();
  });
});

describe('TicTacToe', () => {
  const ana = { sessionId: 'a', name: 'Ana' };
  const bea = { sessionId: 'b', name: 'Bea' };
  const carla = { sessionId: 'c', name: 'Carla' };

  function seated() {
    const game = new TicTacToe();
    game.sit(ana);
    game.sit(bea);
    return game;
  }

  it('dos asientos: X para la primera persona, O para la segunda, y nadie más', () => {
    const game = seated();
    expect(game.markOf('a')).toBe('X');
    expect(game.markOf('b')).toBe('O');
    expect(game.sit(carla)).toMatch(/dos personas/);
  });

  it('valida turnos, casillas ocupadas y que haya dos jugadores', () => {
    const solo = new TicTacToe();
    solo.sit(ana);
    expect(solo.play('a', 0)).toMatch(/otra persona/);

    const game = seated();
    expect(game.play('c', 0)).toMatch(/Siéntate/);
    expect(game.play('b', 0)).toMatch(/turno/);
    expect(game.play('a', 0)).toBeNull();
    expect(game.play('b', 0)).toMatch(/ocupada/);
    expect(game.turn).toBe('O');
  });

  it('termina con un ganador, y en la revancha empieza el otro', () => {
    const game = seated();
    for (const [who, cell] of [
      ['a', 0],
      ['b', 3],
      ['a', 1],
      ['b', 4],
      ['a', 2],
    ] as const) {
      expect(game.play(who, cell)).toBeNull();
    }
    expect(game.outcome).toEqual({ winner: 'X', line: [0, 1, 2] });
    expect(game.play('b', 5)).toMatch(/terminado/);
    expect(game.rematch('c')).toMatch(/Solo quien juega/);
    expect(game.rematch('b')).toBeNull();
    expect(game.board.every((c) => c === null)).toBe(true);
    expect(game.turn).toBe('O');
  });

  it('si alguien se levanta a mitad de partida, se empieza de cero', () => {
    const game = seated();
    game.play('a', 4);
    expect(game.stand('a')).toBe(true);
    expect(game.started).toBe(false);
    expect(game.seats.X).toBeNull();
    expect(game.sit(carla)).toBeNull();
    expect(game.markOf('c')).toBe('X');
  });

  it('valida los mensajes', () => {
    expect(parseGameOpen({ objectId: 'obj-9' })).toEqual({ objectId: 'obj-9' });
    expect(parseGameOpen({ objectId: 'board-9' })).toBeNull();
    expect(parseGameMove({ cell: 8 })).toEqual({ cell: 8 });
    expect(parseGameMove({ cell: 9 })).toBeNull();
    expect(parseGameMove({ cell: 1.5 })).toBeNull();
  });
});
