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
}

export interface SegmentOptions {
  /** Locale hint passed to `Intl.Segmenter`. */
  readonly locale?: Intl.LocalesArgument;
}

export interface CleanupEfficiencyOptions {
  /** Cost of starting a new edit, measured in grapheme tokens. Defaults to `4`. */
  readonly editCost?: number;
}
