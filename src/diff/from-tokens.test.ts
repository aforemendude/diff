import { describe, expect, it } from 'vitest';
import type { TokenDiff } from '../algorithm/myers';
import { DELETE, EQUAL, INSERT } from '../types';
import { joinTokenDiffs } from './from-tokens';

describe('joinTokenDiffs', () => {
  it('returns no tuples for an empty token diff', () => {
    expect(joinTokenDiffs([])).toEqual([]);
  });

  it('joins every token run while preserving operations and input data', () => {
    const input: TokenDiff<string>[] = [
      [EQUAL, ['same', ' text']],
      [DELETE, ['old', ' value']],
      [INSERT, ['new', ' value']],
    ];

    expect(joinTokenDiffs(input)).toEqual([
      [EQUAL, 'same text'],
      [DELETE, 'old value'],
      [INSERT, 'new value'],
    ]);
    expect(input).toEqual([
      [EQUAL, ['same', ' text']],
      [DELETE, ['old', ' value']],
      [INSERT, ['new', ' value']],
    ]);
  });
});
