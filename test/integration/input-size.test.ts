import { describe, expect, it, vi } from 'vitest';
import { diffGraphemes } from '../../src/grapheme.js';
import { diffLines } from '../../src/line.js';

const maximumCombinedInputLength = 0xffff_fffe;
const oversizedInput = { length: maximumCombinedInputLength } as unknown as string;
const inputSizeError = new RangeError('Combined input length exceeds 4,294,967,294 UTF-16 code units');

describe('public input-size limit', () => {
  it('rejects line inputs before trivial-case shortcuts or tokenization', () => {
    const split = vi.spyOn(String.prototype, 'split');

    try {
      expect(() => diffLines(oversizedInput, oversizedInput, { optimizeTrivialCases: true })).toThrow(inputSizeError);
      expect(split).not.toHaveBeenCalled();
    } finally {
      split.mockRestore();
    }
  });

  it('rejects grapheme inputs before segmenter construction or trivial-case shortcuts', () => {
    const segmenter = vi.spyOn(Intl, 'Segmenter');

    try {
      expect(() =>
        diffGraphemes(oversizedInput, oversizedInput, {
          locale: 'not_a_locale',
          optimizeTrivialCases: true,
        }),
      ).toThrow(inputSizeError);
      expect(segmenter).not.toHaveBeenCalled();
    } finally {
      segmenter.mockRestore();
    }
  });
});
