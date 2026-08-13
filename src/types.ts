export const DELETE = -1 as const;
export const EQUAL = 0 as const;
export const INSERT = 1 as const;

export type DiffOperation = typeof DELETE | typeof EQUAL | typeof INSERT;

/** A compact operation/text pair. */
export type Diff = readonly [operation: DiffOperation, text: string];

export interface SegmentOptions {
  /** Locale hint passed to `Intl.Segmenter`. */
  readonly locale?: Intl.LocalesArgument;
}

export interface TextDiffOptions extends SegmentOptions {
  /** Apply human-readable semantic cleanup. Defaults to `semantic`. */
  readonly cleanup?: 'none' | 'semantic';
}
