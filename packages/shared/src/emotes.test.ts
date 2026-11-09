import { describe, expect, it } from 'vitest';
import { EMOTE_IDS, parseEmote, parseHand } from './emotes.js';

describe('parseEmote', () => {
  it('acepta solo reacciones conocidas', () => {
    for (const emote of EMOTE_IDS) expect(parseEmote({ emote })).toEqual({ emote });
    expect(parseEmote({ emote: 'toString' })).toBeNull();
    expect(parseEmote({ emote: '💩' })).toBeNull();
    expect(parseEmote('wave')).toBeNull();
    expect(parseEmote(null)).toBeNull();
  });
});

describe('parseHand', () => {
  it('acepta solo booleanos', () => {
    expect(parseHand({ raised: true })).toEqual({ raised: true });
    expect(parseHand({ raised: false })).toEqual({ raised: false });
    expect(parseHand({ raised: 1 })).toBeNull();
    expect(parseHand({})).toBeNull();
  });
});
