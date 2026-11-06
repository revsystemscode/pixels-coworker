import { describe, expect, it } from 'vitest';
import { CHAT_MAX_LENGTH, NAME_MAX_LENGTH } from './constants.js';
import { parseStep, sanitizeAvatar, sanitizeChat, sanitizeName } from './protocol.js';

describe('sanitizeName', () => {
  it('recorta espacios y longitud', () => {
    expect(sanitizeName('  Ana   María ')).toBe('Ana María');
    expect(sanitizeName('x'.repeat(100))).toHaveLength(NAME_MAX_LENGTH);
  });

  it('usa "Invitado" si no hay nombre válido', () => {
    expect(sanitizeName('   ')).toBe('Invitado');
    expect(sanitizeName(42)).toBe('Invitado');
  });
});

describe('sanitizeAvatar', () => {
  it('acepta solo índices válidos', () => {
    expect(sanitizeAvatar(3)).toBe(3);
    expect(sanitizeAvatar(99)).toBe(0);
    expect(sanitizeAvatar(-1)).toBe(0);
    expect(sanitizeAvatar('2')).toBe(0);
  });
});

describe('parseStep', () => {
  it('acepta pasos bien formados', () => {
    expect(parseStep({ dir: 'up', seq: 1 })).toEqual({ dir: 'up', seq: 1 });
  });

  it('rechaza direcciones o secuencias inválidas', () => {
    expect(parseStep({ dir: 'diagonal', seq: 1 })).toBeNull();
    expect(parseStep({ dir: 'up', seq: -1 })).toBeNull();
    expect(parseStep({ dir: 'up', seq: 1.5 })).toBeNull();
    expect(parseStep(null)).toBeNull();
    expect(parseStep('up')).toBeNull();
  });
});

describe('sanitizeChat', () => {
  it('limpia y limita el texto', () => {
    expect(sanitizeChat({ text: '  hola  ' })).toBe('hola');
    expect(sanitizeChat({ text: 'a\u0000b' })).toBe('ab');
    expect(sanitizeChat({ text: 'x'.repeat(1000) })).toHaveLength(CHAT_MAX_LENGTH);
  });

  it('rechaza mensajes vacíos o mal formados', () => {
    expect(sanitizeChat({ text: '   ' })).toBeNull();
    expect(sanitizeChat({ text: 5 })).toBeNull();
    expect(sanitizeChat('hola')).toBeNull();
  });
});
