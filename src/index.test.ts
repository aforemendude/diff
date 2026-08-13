import { describe, expect, it } from 'vitest';
import { diffText } from './index';

describe('diffText', () => {
  it('returns equal text as one part', () => {
    expect(diffText('same', 'same')).toEqual([{ type: 'equal', value: 'same' }]);
  });

  it('returns changed text as delete and insert parts', () => {
    expect(diffText('before', 'after')).toEqual([
      { type: 'delete', value: 'before' },
      { type: 'insert', value: 'after' },
    ]);
  });

  it('omits empty parts', () => {
    expect(diffText('', '')).toEqual([]);
    expect(diffText('', 'after')).toEqual([{ type: 'insert', value: 'after' }]);
    expect(diffText('before', '')).toEqual([{ type: 'delete', value: 'before' }]);
  });
});
