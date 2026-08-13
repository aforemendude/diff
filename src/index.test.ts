import { describe, expect, it } from 'vitest';
import { cleanupSemantic } from './cleanup/semantic';
import { diffGraphemes } from './diff/grapheme';
import { diffLines } from './diff/line';
import { diffText } from './diff/text';
import * as index from './index';
import { DELETE, EQUAL, INSERT } from './types';

describe('public entry point', () => {
  it('exposes the complete runtime API', () => {
    expect({ ...index }).toEqual({
      cleanupSemantic,
      diffGraphemes,
      diffLines,
      diffText,
      DELETE,
      EQUAL,
      INSERT,
    });
  });
});
