import { describe, expect, it } from 'vitest';
import { expectValidGraphemeDiff } from '../test-support/diff.test.helper';
import { DELETE, EQUAL, INSERT } from '../types';
import { diffText } from './text';

describe('diffText', () => {
  it('returns equal text as one compact tuple', () => {
    expect(diffText('same', 'same')).toEqual([[EQUAL, 'same']]);
  });

  it('performs grapheme-level edits', () => {
    expect(diffText('cat', 'cut')).toEqual([
      [EQUAL, 'c'],
      [DELETE, 'a'],
      [INSERT, 'u'],
      [EQUAL, 't'],
    ]);
  });

  it('omits empty parts', () => {
    expect(diffText('', '')).toEqual([]);
    expect(diffText('', 'after')).toEqual([[INSERT, 'after']]);
    expect(diffText('before', '')).toEqual([[DELETE, 'before']]);
  });

  it('handles a single edit well beyond JavaScript argument-count limits', () => {
    const before = 'a'.repeat(130_000);
    const diffs = diffText(before, '');

    expect(diffs).toEqual([[DELETE, before]]);
    expectValidGraphemeDiff(before, '', diffs);
  });

  it('keeps a useful partial-word edit instead of forcing the whole word', () => {
    const diffs = diffText('cat', 'cut', { cleanup: 'semantic', locale: 'en' });

    expect(diffs).toEqual([
      [EQUAL, 'c'],
      [DELETE, 'a'],
      [INSERT, 'u'],
      [EQUAL, 't'],
    ]);
    expectValidGraphemeDiff('cat', 'cut', diffs, 'en');
  });

  it('supports raw and semantic cleanup with locale-aware boundaries', () => {
    const before = 'ฉันกินข้าว';
    const after = 'ฉันกิจกรรมกินข้าว';
    const raw = [
      [EQUAL, 'ฉันกิ'],
      [INSERT, 'จกรรมกิ'],
      [EQUAL, 'นข้าว'],
    ] as const;
    const semantic = [
      [EQUAL, 'ฉัน'],
      [INSERT, 'กิจกรรม'],
      [EQUAL, 'กินข้าว'],
    ] as const;

    expect(diffText(before, after, { cleanup: 'none', locale: 'th' })).toEqual(raw);
    expect(diffText(before, after, { cleanup: 'semantic', locale: 'th' })).toEqual(semantic);
    expect(diffText(before, after, { locale: 'th' })).toEqual(semantic);
  });

  it('preserves reconstruction and cluster boundaries across deterministic randomized inputs', () => {
    const pieces = ['a', 'b', ' ', '.', '\n', '\r', '\u0301', 'e\u0300', '👩‍💻', '👍🏽', '🇺🇳', 'ฉั', 'กิ', 'क्‍ष'] as const;
    let state = 0x1234_5678;
    const random = (): number => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state / 0x1_0000_0000;
    };
    const makeText = (): string => {
      const length = Math.floor(random() * 24);
      return Array.from({ length }, () => pieces[Math.floor(random() * pieces.length)]).join('');
    };

    for (let iteration = 0; iteration < 500; iteration++) {
      const before = makeText();
      const after = makeText();
      expectValidGraphemeDiff(before, after, diffText(before, after));
    }
  });
});
