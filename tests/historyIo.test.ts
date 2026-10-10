import { describe, expect, it } from 'vitest';
import { makeBackup } from '../src/core/backup';
import { makeHistoryExport, mergeHistory, parseHistoryImport } from '../src/core/historyIo';
import { DEFAULT_SETTINGS, type Attempt } from '../src/types';

const att = (id: string, finishedAt: number): Attempt => ({
  id, kind: 'random', name: 'T', mode: 'exam', startedAt: finishedAt - 10, finishedAt, usedSec: 10, limitSec: null,
  passPercent: 80, partialCredit: false, total: 0, points: 0, percent: 0, passed: false, timedOut: false, items: [],
});

describe('history export / import', () => {
  it('round-trips', () => {
    const h = [att('a', 1), att('b', 2)];
    const r = parseHistoryImport(makeHistoryExport(h));
    expect(r.attempts).toEqual(h);
    expect(r.dropped).toBe(0);
  });

  it('reads the history part of a full backup', () => {
    const text = makeBackup({ questions: [], exams: [], history: [att('a', 1)], settings: DEFAULT_SETTINGS });
    expect(parseHistoryImport(text).attempts.map((a) => a.id)).toEqual(['a']);
  });

  it('drops broken records and rejects foreign files', () => {
    const text = JSON.stringify({ app: 'nse4-exam-history', history: [att('a', 1), { id: 'x' }] });
    expect(parseHistoryImport(text)).toMatchObject({ dropped: 1 });
    expect(() => parseHistoryImport('{"app":"other"}')).toThrow();
    expect(() => parseHistoryImport('nope')).toThrow();
  });

  it('merge keeps existing ids, skips duplicates and sorts by date', () => {
    const cur = [att('b', 20)];
    const m = mergeHistory(cur, [att('a', 10), att('b', 99), att('a', 10), att('c', 30)]);
    expect(m.history.map((a) => a.id)).toEqual(['a', 'b', 'c']);
    expect(m).toMatchObject({ added: 2, skipped: 2 });
    expect(mergeHistory(cur, [att('b', 20)]).history).toBe(cur);
  });
});
