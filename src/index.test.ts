import { describe, expect, it } from 'vitest';
import { cleanupEfficiency } from './cleanup/efficiency';
import { cleanupSemantic } from './cleanup/semantic';
import { diffGraphemes } from './diff/grapheme';
import { diffLines } from './diff/line';
import * as index from './index';
import { DELETE, EQUAL, INSERT } from './types';

describe('public entry point', () => {
  it('exposes the complete runtime API', () => {
    expect({ ...index }).toEqual({
      cleanupEfficiency,
      cleanupSemantic,
      diffGraphemes,
      diffLines,
      DELETE,
      EQUAL,
      INSERT,
    });
  });
});
