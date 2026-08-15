export const DELETE = -1 as const;
export const EQUAL = 0 as const;
export const INSERT = 1 as const;

export type DiffOperation = typeof DELETE | typeof EQUAL | typeof INSERT;

/** A compact operation/token-array pair. */
export type Diff = readonly [operation: DiffOperation, tokens: readonly string[]];

/** A supported line-ending sequence. */
export type LineEnding = '\r' | '\n' | '\r\n';

export interface LineDiffOptions {
  /** Exact line-ending sequence used as the delimiter. Defaults to `\n`. */
  readonly lineEnding?: LineEnding;
  /** Fast-path identical inputs and diffs with exactly one empty input. Defaults to `false`. */
  readonly optimizeTrivialCases?: boolean;
}

export interface SegmentOptions {
  /** Locale hint passed to `Intl.Segmenter`. */
  readonly locale?: Intl.LocalesArgument;
}

export interface GraphemeDiffOptions extends SegmentOptions {
  /** Fast-path identical inputs and diffs with exactly one empty input. Defaults to `false`. */
  readonly optimizeTrivialCases?: boolean;
}

export interface CleanupEfficiencyOptions {
  /** Finite, non-negative cost of starting a new edit, measured in grapheme tokens. Defaults to `4`. */
  readonly editCost?: number;
}
