import type { TokenDiff } from '../algorithm/myers';
import type { Diff } from '../types';

export const joinTokenDiffs = (diffs: readonly TokenDiff<string>[]): Diff[] =>
  diffs.map(([operation, tokens]) => [operation, tokens.join('')]);
