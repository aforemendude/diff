/** Largest combined UTF-16 input length supported by the compact Myers frontier. */
export const MAX_COMBINED_INPUT_LENGTH = 0xffff_fffe;

/** Test the compact-frontier limit without adding potentially oversized lengths. */
export const isCombinedInputLengthSupported = (beforeLength: number, afterLength: number): boolean =>
  beforeLength <= MAX_COMBINED_INPUT_LENGTH - afterLength;

/** Reject inputs whose token coordinates might exceed the compact Myers frontier. */
export const assertCombinedInputLength = (before: string, after: string): void => {
  if (!isCombinedInputLengthSupported(before.length, after.length)) {
    throw new RangeError('Combined input length exceeds 4,294,967,294 UTF-16 code units');
  }
};
