import { diffTokens } from '../algorithm/myers';
import { tokenizeGraphemes } from '../tokenize/graphemes';
import type { Diff, SegmentOptions } from '../types';
import { joinTokenDiffs } from './from-tokens';

/** Compute an exact diff whose smallest indivisible unit is one grapheme. */
export const diffGraphemes = (before: string, after: string, options: SegmentOptions = {}): readonly Diff[] =>
  joinTokenDiffs(diffTokens(tokenizeGraphemes(before, options), tokenizeGraphemes(after, options)));
