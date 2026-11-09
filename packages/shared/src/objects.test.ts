import { describe, expect, it } from 'vitest';
import { NOTE_MAX_LENGTH } from './constants.js';
import { interactableAt, interactableNear, parseWorldMap } from './map.js';
import {
  canEditObjects,
  parseObjectEdit,
  parseObjectValue,
  parseVideoUrl,
  videoEmbedUrl,
} from './objects.js';
import { tiledFromAscii } from './testing.js';

describe('enlaces', () => {
  it('acepta direcciones web y les pone https si no lo llevan', () => {
    expect(parseObjectValue('link', ' https://ejemplo.com/a?b=1 ')).toEqual({
      ok: true,
      value: 'https://ejemplo.com/a?b=1',
    });
    expect(parseObjectValue('link', 'ejemplo.com')).toEqual({
      ok: true,
      value: 'https://ejemplo.com/',
    });
    expect(parseObjectValue('link', '')).toEqual({ ok: true, value: '' });
  });

  it('rechaza otros esquemas, credenciales y cosas que no son direcciones', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,hola',
      'file:///etc/passwd',
      'https://usuario:clave@ejemplo.com',
      'hola',
      `https://ejemplo.com/${'a'.repeat(3000)}`,
    ]) {
      expect(parseObjectValue('link', bad).ok, bad).toBe(false);
    }
  });
});

describe('videos', () => {
  it('reconoce enlaces de YouTube y Vimeo', () => {
    const id = 'dQw4w9WgXcQ';
    for (const url of [
      `https://www.youtube.com/watch?v=${id}&t=10`,
      `https://youtu.be/${id}`,
      `youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube-nocookie.com/embed/${id}`,
    ]) {
      expect(parseVideoUrl(url), url).toBe(`youtube:${id}`);
    }
    expect(parseVideoUrl('https://vimeo.com/76979871')).toBe('vimeo:76979871');
    expect(parseVideoUrl('https://player.vimeo.com/video/76979871')).toBe('vimeo:76979871');
  });

  it('no acepta otras webs ni ids raros', () => {
    for (const url of [
      'https://ejemplo.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=<script>',
      'https://vimeo.com/abc',
      'javascript:alert(1)',
    ]) {
      expect(parseVideoUrl(url), url).toBeNull();
      expect(parseObjectValue('video', url).ok).toBe(false);
    }
  });

  it('el reproductor sale siempre de YouTube (sin cookies) o de Vimeo', () => {
    expect(videoEmbedUrl('youtube:dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    expect(videoEmbedUrl('vimeo:76979871')).toBe('https://player.vimeo.com/video/76979871');
    expect(videoEmbedUrl('youtube:../../x')).toBeNull();
    expect(videoEmbedUrl('https://evil.com')).toBeNull();
  });
});

describe('notas', () => {
  it('limpia caracteres de control y limita la longitud', () => {
    expect(parseObjectValue('note', '  hola\r\nadiós\u0000 ')).toEqual({
      ok: true,
      value: 'hola\nadiós',
    });
    expect(parseObjectValue('note', 'x'.repeat(NOTE_MAX_LENGTH + 1)).ok).toBe(false);
    expect(parseObjectValue('note', 5).ok).toBe(false);
  });

  it('la mesa de juego no tiene contenido que editar', () => {
    expect(parseObjectValue('game', 'hola').ok).toBe(false);
  });
});

describe('permisos y mensajes', () => {
  it('solo dueño y admins editan', () => {
    expect(canEditObjects('owner')).toBe(true);
    expect(canEditObjects('admin')).toBe(true);
    expect(canEditObjects('member')).toBe(false);
    expect(canEditObjects('guest')).toBe(false);
  });

  it('valida el mensaje de edición', () => {
    expect(parseObjectEdit({ objectId: 'obj-3', value: 'hola' })).toEqual({
      objectId: 'obj-3',
      value: 'hola',
    });
    expect(parseObjectEdit({ objectId: 'board-3', value: 'hola' })).toBeNull();
    expect(parseObjectEdit({ objectId: 'obj-3', value: 3 })).toBeNull();
  });
});

describe('objetos en el mapa', () => {
  const map = (objects: Parameters<typeof tiledFromAscii>[4]) =>
    tiledFromAscii(['#######', '#S....#', '#.....#', '#######'], 16, [], [], objects);

  it('lee tipo, nombre y contenido inicial', () => {
    const world = parseWorldMap(
      map([
        { name: 'Tablón', type: 'note', x: 1, y: 0, width: 2, height: 1, value: 'Hola' },
        { name: '', type: 'video', x: 4, y: 0, width: 2, height: 1, value: 'youtu.be/dQw4w9WgXcQ' },
      ]),
    );
    expect(world.objects).toEqual([
      {
        id: 'obj-1',
        name: 'Tablón',
        kind: 'note',
        x: 1,
        y: 0,
        width: 2,
        height: 1,
        initial: 'Hola',
      },
      {
        id: 'obj-2',
        name: 'Video',
        kind: 'video',
        x: 4,
        y: 0,
        width: 2,
        height: 1,
        initial: 'youtube:dQw4w9WgXcQ',
      },
    ]);
  });

  it('rechaza tipos desconocidos y contenidos no válidos', () => {
    expect(() =>
      parseWorldMap(map([{ name: 'X', type: 'tv', x: 1, y: 0, width: 1, height: 1 }])),
    ).toThrow(/tipo desconocido/);
    expect(() =>
      parseWorldMap(
        map([{ name: 'X', type: 'link', x: 1, y: 0, width: 1, height: 1, value: 'javascript:1' }]),
      ),
    ).toThrow(/dirección web/);
  });

  it('encuentra el objeto o la pizarra más cercana', () => {
    const world = parseWorldMap(
      tiledFromAscii(
        ['#########', '#S......#', '#.......#', '#.......#', '#########'],
        16,
        [],
        [{ name: 'Pizarra', x: 1, y: 0, width: 2, height: 1 }],
        [{ name: 'Nota', type: 'note', x: 6, y: 0, width: 1, height: 1 }],
      ),
    );
    expect(interactableNear(world, { x: 1, y: 1 })).toMatchObject({ type: 'board' });
    expect(interactableNear(world, { x: 6, y: 2 })).toMatchObject({
      type: 'object',
      item: { name: 'Nota' },
    });
    expect(interactableNear(world, { x: 4, y: 3 })).toBeNull();
    expect(interactableAt(world, { x: 6, y: 0 })).toMatchObject({ item: { id: 'obj-1' } });
  });
});
