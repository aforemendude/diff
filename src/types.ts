export const DELETE = -1 as const;
export const EQUAL = 0 as const;
export const INSERT = 1 as const;

export type DiffOperation = typeof DELETE | typeof EQUAL | typeof INSERT;

/** A compact operation/text pair. */
export type Diff = readonly [operation: DiffOperation, text: string];

/** A supported line-ending sequence. */
export type LineEnding = '\r' | '\n' | '\r\n';

export interface SegmentOptions {
  /** Locale hint passed to `Intl.Segmenter`. */
  readonly locale?: Intl.LocalesArgument;
}

export interface CleanupEfficiencyOptions extends SegmentOptions {
  /** Cost of starting a new edit, measured in graphemes. Defaults to `4`. */
  readonly editCost?: number;
}
