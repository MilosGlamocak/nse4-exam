import { describe, expect, it } from 'vitest';
import { breakdown, filterQuestions, questionStats, weakAreas } from '../src/core/stats';
import { buildClaudeExport } from '../src/core/claudeExport';
import { buildSession, finishSession } from '../src/core/session';
import { backupDue, makeBackup, parseBackup } from '../src/core/backup';
import { DEFAULT_SETTINGS, type Attempt } from '../src/types';
import { mkQ, rawQ } from './helpers';

function attempt(finishedAt: number, results: Record<string, { ok: boolean; flag?: boolean }>, qs = ALL): Attempt {
  const byId = new Map(qs.map((q) => [q.id, q] as const));
  const s = buildSession({
    kind: 'random', name: 'T', mode: 'exam', questions: qs.filter((q) => q.id in results), limitSec: 6300,
    passPercent: 70, partialCredit: false, shuffleQuestions: false, shuffleOptions: false,
  });
  for (const it of s.items) {
    const q = byId.get(it.qid)!;
    it.selected = results[it.qid].ok ? q.correct : ['A'].filter((x) => !q.correct.includes(x)).concat(q.correct.includes('A') ? ['D'] : []);
    it.flagged = !!results[it.qid].flag;
  }
  s.elapsedSec = 100;
  return { ...finishSession(s, byId, { now: finishedAt }), id: 'a' + finishedAt };
}

const ALL = [
  mkQ('q1', { lesson: 1, topic: 'Routing', source: 'dump' }),
  mkQ('q2', { lesson: 2, topic: 'VPN', source: 'kc' }),
  mkQ('q3', { lesson: 2, topic: 'VPN', source: 'kc' }),
  mkQ('q4', { lesson: 3, topic: 'HA', source: 'quiz' }),
];
const none = { lessons: new Set<number>(), topics: new Set<string>(), sources: new Set<string>() };

describe('questionStats + filters', () => {
  const hist = [
    attempt(1, { q1: { ok: false }, q2: { ok: true } }),
    attempt(2, { q1: { ok: true }, q2: { ok: false, flag: true } }),
  ];
  const st = questionStats(hist);

  it('derives seen / last result / flagged', () => {
    expect(st.get('q1')).toMatchObject({ seen: 2, lastCorrect: true, wrongCount: 1 });
    expect(st.get('q2')).toMatchObject({ seen: 2, lastCorrect: false, lastFlagged: true });
    expect(st.has('q3')).toBe(false);
  });
  it('wrong = last attempt was wrong', () => {
    expect(filterQuestions(ALL, st, { ...none, status: 'wrong' }).map((q) => q.id)).toEqual(['q2']);
  });
  it('flagged', () => {
    expect(filterQuestions(ALL, st, { ...none, status: 'flagged' }).map((q) => q.id)).toEqual(['q2']);
  });
  it('unseen', () => {
    expect(filterQuestions(ALL, st, { ...none, status: 'unseen' }).map((q) => q.id)).toEqual(['q3', 'q4']);
  });
  it('lesson / topic / source filters combine with AND', () => {
    expect(filterQuestions(ALL, st, { ...none, lessons: new Set([2]), status: 'all' }).map((q) => q.id)).toEqual(['q2', 'q3']);
    expect(filterQuestions(ALL, st, { ...none, topics: new Set(['HA']), status: 'all' }).map((q) => q.id)).toEqual(['q4']);
    expect(filterQuestions(ALL, st, { ...none, sources: new Set(['kc']), lessons: new Set([2]), status: 'unseen' }).map((q) => q.id)).toEqual(['q3']);
  });
});

describe('breakdown / weakAreas', () => {
  const a = attempt(5, { q1: { ok: true }, q2: { ok: false }, q3: { ok: true }, q4: { ok: false } });
  it('groups by lesson, topic and source', () => {
    const l = breakdown(a.items, 'lesson');
    expect(l.map((b) => [b.key, b.correct, b.total])).toEqual([['1', 1, 1], ['2', 1, 2], ['3', 0, 1]]);
    const t = breakdown(a.items, 'topic');
    expect(t.find((b) => b.key === 'VPN')!.percent).toBe(50);
    expect(breakdown(a.items, 'source').map((b) => b.key).sort()).toEqual(['dump', 'kc', 'quiz']);
  });
  it('weakAreas sorts worst first and builds a chronological trend', () => {
    const h = [attempt(1, { q2: { ok: false } }), attempt(2, { q2: { ok: true } }), attempt(3, { q2: { ok: true }, q4: { ok: false } })];
    const w = weakAreas(h, 'topic');
    expect(w[0].key).toBe('HA');
    const vpn = w.find((x) => x.key === 'VPN')!;
    expect(vpn.trend).toEqual([0, 100, 100]);
    expect(vpn.percent).toBeCloseTo(66.67, 1);
  });
});

describe('buildClaudeExport', () => {
  it('lists only wrong/flagged questions with displayed letters, my answer and the correct answer', () => {
    const q = mkQ('x1', { type: 'multi', correct: ['B', 'D'], topic: 'IPsec VPN', lesson: 11 });
    const s = buildSession({
      kind: 'random', name: 'Ispit 1', mode: 'exam', questions: [q, ALL[0]], limitSec: 6300, passPercent: 70,
      partialCredit: false, shuffleQuestions: false, shuffleOptions: false,
    });
    s.items[0].order = ['D', 'C', 'B', 'A']; // displayed: A=D B=C C=B D=A
    s.items[0].selected = ['C']; // user picked displayed B
    s.items[1].selected = ['B']; // correct, not flagged
    const a = finishSession(s, new Map([q, ALL[0]].map((x) => [x.id, x] as const)), { now: 1 });
    const txt = buildClaudeExport(a);
    expect(txt).toContain('Ispit 1');
    expect(txt).toContain('1/2 (50%)'); // overall score line present
    expect(txt).toContain('id=x1');
    expect(txt).not.toContain('id=q1');
    expect(txt).toContain('A) d');
    expect(txt).toContain('B) c');
    expect(txt).toContain('Moj odgovor: B');
    expect(txt).toContain('Tacan odgovor: A, C'); // B,D originals -> displayed C,A sorted
    expect(txt).toContain('IPsec VPN');
    expect(txt).toContain('POGRESNO');
  });

  it('flagged-but-correct questions are included and tagged', () => {
    const a = attempt(1, { q1: { ok: true, flag: true } });
    const txt = buildClaudeExport(a);
    expect(txt).toContain('TACNO+FLAGGED');
  });

  it('says so when nothing is wrong or flagged', () => {
    expect(buildClaudeExport(attempt(1, { q1: { ok: true } }))).toContain('Nema pogresnih');
  });
});

describe('backup', () => {
  it('round-trips questions, exams, history and settings', () => {
    const q = rawQ({ id: 'z' });
    const data = {
      questions: [{ ...(q as object), pack: 'p', addedAt: 1 } as never],
      exams: [{ id: 'e', name: 'E', questionIds: ['z'], durationMinutes: 10, passPercent: 70, pack: 'p' }],
      history: [attempt(1, { q1: { ok: true } })],
      settings: { ...DEFAULT_SETTINGS, partialCredit: true },
    };
    const r = parseBackup(makeBackup(data, 5));
    expect(r.dropped).toBe(0);
    expect(r.data.questions[0].id).toBe('z');
    expect(r.data.exams[0].pack).toBe('p');
    expect(r.data.history).toHaveLength(1);
    expect(r.data.settings.partialCredit).toBe(true);
  });
  it('rejects foreign JSON and drops invalid entries', () => {
    expect(() => parseBackup('{"a":1}')).toThrow();
    expect(() => parseBackup('nope')).toThrow();
    const bad = JSON.stringify({ app: 'nse4-exam-backup', questions: [{ id: 'bad' }], exams: [], history: [{}] });
    const r = parseBackup(bad);
    expect(r.data.questions).toEqual([]);
    expect(r.dropped).toBe(2);
  });
  it('backupDue: never / stale / fresh / snoozed / no data', () => {
    const day = 86400000;
    const now = 100 * day;
    expect(backupDue({ lastBackupAt: null, bannerSnoozedUntil: null }, true, now)).toBe(true);
    expect(backupDue({ lastBackupAt: null, bannerSnoozedUntil: null }, false, now)).toBe(false);
    expect(backupDue({ lastBackupAt: now - 8 * day, bannerSnoozedUntil: null }, true, now)).toBe(true);
    expect(backupDue({ lastBackupAt: now - 6 * day, bannerSnoozedUntil: null }, true, now)).toBe(false);
    expect(backupDue({ lastBackupAt: now - 8 * day, bannerSnoozedUntil: now + day }, true, now)).toBe(false);
  });
});
