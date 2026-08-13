import { diffTokens } from '../algorithm/myers';
import { tokenizeGraphemes } from '../tokenize/graphemes';
import type { Diff, SegmentOptions } from '../types';

/** Compute an exact diff whose smallest indivisible unit is one grapheme. */
export const diffGraphemes = (before: string, after: string, options: SegmentOptions = {}): readonly Diff[] =>
  diffTokens(tokenizeGraphemes(before, options), tokenizeGraphemes(after, options));
