import { describe, expect, it } from 'vitest';
import { DELETE, EQUAL, INSERT, diffText } from './index';

describe('diffText', () => {
  it('returns equal text as one compact tuple', () => {
    expect(diffText('same', 'same')).toEqual([[EQUAL, 'same']]);
  });

  it('performs grapheme-level edits', () => {
    expect(diffText('cat', 'cut')).toEqual([
      [EQUAL, 'c'],
      [DELETE, 'a'],
      [INSERT, 'u'],
      [EQUAL, 't'],
    ]);
  });

  it('omits empty parts', () => {
    expect(diffText('', '')).toEqual([]);
    expect(diffText('', 'after')).toEqual([[INSERT, 'after']]);
    expect(diffText('before', '')).toEqual([[DELETE, 'before']]);
  });
});
