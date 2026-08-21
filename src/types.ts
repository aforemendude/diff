export const DELETE = -1 as const;
export const EQUAL = 0 as const;
export const INSERT = 1 as const;

export type DiffOperation = typeof DELETE | typeof EQUAL | typeof INSERT;

/** A compact operation/token-array pair. */
export type Diff = readonly [operation: DiffOperation, tokens: readonly string[]];

/** An exact token-diff engine or the adaptive engine-selection policy. */
export type DiffAlgorithm = 'adaptive' | 'myers' | 'sparse';

/** A supported line-ending sequence. */
export type LineEnding = '\r' | '\n' | '\r\n';

export interface LineDiffOptions {
  /** Exact diff algorithm or adaptive selection policy. Defaults to `adaptive`. */
  readonly algorithm?: DiffAlgorithm;
  /** Exact line-ending sequence used as the delimiter. Defaults to `\n`. */
  readonly lineEnding?: LineEnding;
  /** Fast-path identical inputs, one-sided diffs, and one insignificant terminal delimiter. Defaults to `false`. */
  readonly optimizeTrivialCases?: boolean;
}

export interface SegmentOptions {
  /** Locale hint passed to `Intl.Segmenter`. */
  readonly locale?: Intl.LocalesArgument;
}

export interface GraphemeDiffOptions extends SegmentOptions {
  /** Exact diff algorithm or adaptive selection policy. Defaults to `adaptive`. */
  readonly algorithm?: DiffAlgorithm;
  /** Fast-path identical inputs and diffs with exactly one empty input. Defaults to `false`. */
  readonly optimizeTrivialCases?: boolean;
}

export interface CleanupEfficiencyOptions {
  /** Finite, non-negative cost of starting a new edit, measured in grapheme tokens. Defaults to `4`. */
  readonly editCost?: number;
}
