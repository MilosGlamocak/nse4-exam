import { describe, expect, it } from 'vitest';
import { applyPack, parseCsvPack, parseJsonPack } from '../src/core/importer';
import { buildSession, finishSession, pickRandom } from '../src/core/session';
import { filterQuestions, questionStats } from '../src/core/stats';
import { mulberry32 } from '../src/core/util';

const N = 2000;
function bigRaw() {
  const rnd = mulberry32(1);
  return Array.from({ length: N }, (_, i) => {
    const multi = rnd() < 0.3;
    return {
      id: `p-${i}`, source: 'claude', lesson: 1 + (i % 16), topic: `Topic ${i % 40}`, type: multi ? 'multi' : 'single',
      question: `Question ${i} ` + 'x'.repeat(200),
      options: ['A', 'B', 'C', 'D', 'E'].map((id) => ({ id, text: `option ${id} ${i}` })),
      correct: multi ? ['A', 'C'] : ['B'],
      ...(i % 20 === 0 ? { image: 'data:image/png;base64,' + 'A'.repeat(200_000) } : {}),
    };
  });
}

describe(`${N}-question bank`, () => {
  it('imports JSON quickly, builds exams and scores them', () => {
    const text = JSON.stringify({ pack: 'big', questions: bigRaw() });
    let t = performance.now();
    const parsed = parseJsonPack(text, 'big.json');
    const { lib, report } = applyPack({ questions: [], exams: [] }, parsed, { overwrite: false });
    const importMs = performance.now() - t;
    expect(report.addedQuestions).toBe(N);
    expect(report.invalid).toHaveLength(0);
    expect(importMs).toBeLessThan(1500);

    // re-import (all skipped) must stay fast too
    t = performance.now();
    const again = applyPack(lib, parsed, { overwrite: false });
    expect(again.report.skippedQuestions).toBe(N);
    expect(performance.now() - t).toBeLessThan(1500);

    t = performance.now();
    const pool = pickRandom(lib.questions, 60);
    const s = buildSession({ kind: 'random', name: 'r', mode: 'exam', questions: pool, limitSec: 6300, passPercent: 70, partialCredit: false, shuffleQuestions: true, shuffleOptions: true });
    s.items.forEach((it) => (it.selected = [it.order[0]]));
    const a = finishSession(s, new Map(lib.questions.map((q) => [q.id, q] as const)));
    const f = filterQuestions(lib.questions, questionStats([a]), { lessons: new Set([3]), topics: new Set(), sources: new Set(), status: 'unseen' });
    expect(performance.now() - t).toBeLessThan(500);
    expect(a.total).toBe(60);
    expect(f.length).toBeGreaterThan(0);
  });

  it('imports a 1500-row CSV quickly', () => {
    const H = 'id;source;lesson;topic;question;A;B;C;D;E;F;correct;explanation';
    const rows = Array.from({ length: 1500 }, (_, i) => `c-${i};dump;${1 + (i % 16)};Topic ${i % 30};Question ${i};a;b;c;d;;;${i % 2 ? 'B' : 'A,C'};expl`);
    const t = performance.now();
    const { lib, report } = applyPack({ questions: [], exams: [] }, parseCsvPack('﻿' + [H, ...rows].join('\r\n'), 'big.csv'), { overwrite: false });
    expect(lib.questions).toHaveLength(1500);
    expect(report.invalid).toHaveLength(0);
    expect(performance.now() - t).toBeLessThan(1000);
  });
});
