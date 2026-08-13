import { describe, expect, it } from 'vitest';
import { tokenizeGraphemes } from './graphemes';

describe('tokenizeGraphemes', () => {
  it('handles empty text', () => {
    expect(tokenizeGraphemes('')).toEqual([]);
  });

  it('keeps extended grapheme clusters intact', () => {
    expect(tokenizeGraphemes('Ae\u0301👩‍💻🇺🇳👍🏽B', { locale: 'en' })).toEqual(['A', 'e\u0301', '👩‍💻', '🇺🇳', '👍🏽', 'B']);
  });

  it('preserves canonically distinct text without normalization', () => {
    expect(tokenizeGraphemes('é e\u0301')).toEqual(['é', ' ', 'e\u0301']);
  });
});
