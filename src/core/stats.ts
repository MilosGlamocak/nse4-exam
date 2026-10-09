import type { Attempt, AttemptItem, Question } from '../types';

export interface QStat {
  seen: number;
  lastCorrect: boolean;
  lastFlagged: boolean;
  wrongCount: number;
}

/** Per-question history derived from attempts (chronological order expected). */
export function questionStats(history: readonly Attempt[]): Map<string, QStat> {
  const m = new Map<string, QStat>();
  for (const a of history) {
    for (const it of a.items) {
      const s = m.get(it.qid) ?? { seen: 0, lastCorrect: false, lastFlagged: false, wrongCount: 0 };
      s.seen++;
      s.lastCorrect = it.isCorrect;
      s.lastFlagged = it.flagged;
      if (!it.isCorrect) s.wrongCount++;
      m.set(it.qid, s);
    }
  }
  return m;
}

export type StatusFilter = 'all' | 'wrong' | 'flagged' | 'unseen';

export interface Filters {
  lessons: ReadonlySet<number>;
  topics: ReadonlySet<string>;
  sources: ReadonlySet<string>;
  status: StatusFilter;
}

/** Empty set = no restriction. */
export function filterQuestions(pool: readonly Question[], stats: ReadonlyMap<string, QStat>, f: Filters): Question[] {
  return pool.filter((q) => {
    if (f.lessons.size && !f.lessons.has(q.lesson)) return false;
    if (f.topics.size && !f.topics.has(q.topic)) return false;
    if (f.sources.size && !f.sources.has(q.source)) return false;
    const s = stats.get(q.id);
    switch (f.status) {
      case 'wrong':
        return !!s && !s.lastCorrect;
      case 'flagged':
        return !!s && s.lastFlagged;
      case 'unseen':
        return !s;
      default:
        return true;
    }
  });
}

export interface Bucket {
  key: string;
  label: string;
  correct: number; // points (may be fractional with partial credit)
  total: number;
  percent: number;
}

export type GroupBy = 'lesson' | 'topic' | 'source';

export function breakdown(items: readonly AttemptItem[], by: GroupBy): Bucket[] {
  const m = new Map<string, Bucket>();
  for (const it of items) {
    const key = by === 'lesson' ? String(it.lesson) : by === 'topic' ? it.topic : it.source;
    const label = by === 'lesson' ? `Lekcija ${it.lesson}` : key;
    const b = m.get(key) ?? { key, label, correct: 0, total: 0, percent: 0 };
    b.correct += it.points;
    b.total += 1;
    m.set(key, b);
  }
  const out = [...m.values()];
  for (const b of out) b.percent = b.total ? (b.correct / b.total) * 100 : 0;
  if (by === 'lesson') out.sort((a, b) => Number(a.key) - Number(b.key));
  else out.sort((a, b) => a.percent - b.percent || b.total - a.total || a.label.localeCompare(b.label));
  return out;
}

export interface Weak {
  key: string;
  label: string;
  answered: number;
  correct: number;
  percent: number;
  /** accuracy (0-100) per attempt in chronological order, newest last, max 12 points */
  trend: number[];
}

export function weakAreas(history: readonly Attempt[], by: 'lesson' | 'topic'): Weak[] {
  const m = new Map<string, Weak & { _perAttempt: number[] }>();
  const sorted = history.slice().sort((a, b) => a.finishedAt - b.finishedAt);
  for (const a of sorted) {
    const local = new Map<string, { c: number; t: number }>();
    for (const it of a.items) {
      const key = by === 'lesson' ? String(it.lesson) : it.topic;
      const w = m.get(key) ?? {
        key,
        label: by === 'lesson' ? `Lekcija ${it.lesson}` : it.topic,
        answered: 0,
        correct: 0,
        percent: 0,
        trend: [],
        _perAttempt: [],
      };
      w.answered++;
      w.correct += it.points;
      m.set(key, w);
      const l = local.get(key) ?? { c: 0, t: 0 };
      l.c += it.points;
      l.t++;
      local.set(key, l);
    }
    for (const [key, l] of local) m.get(key)!._perAttempt.push((l.c / l.t) * 100);
  }
  const out: Weak[] = [];
  for (const w of m.values()) {
    w.percent = w.answered ? (w.correct / w.answered) * 100 : 0;
    w.trend = w._perAttempt.slice(-12);
    const { _perAttempt, ...rest } = w;
    void _perAttempt;
    out.push(rest);
  }
  out.sort((a, b) => a.percent - b.percent || b.answered - a.answered);
  return out;
}
