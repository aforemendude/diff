export interface TextWorkload {
  readonly before: string;
  readonly after: string;
  /** Proven number of separated edit regions, when analytically known. */
  readonly editHunkCount?: number;
  /** Proven minimum number of inserted and deleted tokens, when analytically known. */
  readonly shortestEditCost?: number;
}

export interface CertifiedTextWorkload extends TextWorkload {
  readonly shortestEditCost: number;
}

export interface SizedLineWorkload extends TextWorkload {
  /** Number of ASCII source characters changed without counting line delimiters. */
  readonly changedCharacterCount: number;
  readonly editHunkCount: number;
  readonly shortestEditCost: number;
}
