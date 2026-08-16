import { describe, expect, it } from 'vitest';
import { MAX_COMBINED_INPUT_LENGTH, assertCombinedInputLength, isCombinedInputLengthSupported } from './input-length';

describe('combined input length', () => {
  it.each([
    [0x7fff_ffff, 0x7fff_ffff],
    [MAX_COMBINED_INPUT_LENGTH, 0],
  ])('accepts the boundary pair (%d, %d)', (beforeLength, afterLength) => {
    expect(isCombinedInputLengthSupported(beforeLength, afterLength)).toBe(true);
  });

  it.each([
    [MAX_COMBINED_INPUT_LENGTH, 1],
    [0xffff_ffff, 0],
  ])('rejects the first oversized pair at (%d, %d)', (beforeLength, afterLength) => {
    expect(isCombinedInputLengthSupported(beforeLength, afterLength)).toBe(false);
  });

  it('throws a deterministic RangeError for an oversized pair', () => {
    const oversized = { length: 0xffff_ffff } as unknown as string;

    expect(() => assertCombinedInputLength(oversized, '')).toThrow(
      new RangeError('Combined input length exceeds 4,294,967,294 UTF-16 code units'),
    );
  });
});
