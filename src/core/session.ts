import type { Attempt, AttemptItem, ExamKind, Mode, Question, Session, SessionItem } from '../types';
import { scoreAnswer, totals } from './scoring';
import { shuffle, uid, type Rng } from './util';

export interface BuildOpts {
  kind: ExamKind;
  name: string;
  examId?: string;
  mode: Mode;
  questions: Question[];
  limitSec: number | null;
  passPercent: number;
  partialCredit: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  rng?: Rng;
  now?: number;
}

/** Creates a fresh session. Option order is shuffled here and stored (`order`) so scoring stays exact. */
export function buildSession(o: BuildOpts): Session {
  const rng = o.rng ?? Math.random;
  const now = o.now ?? Date.now();
  const qs = o.shuffleQuestions ? shuffle(o.questions, rng) : o.questions.slice();
  const items: SessionItem[] = qs.map((q) => ({
    qid: q.id,
    order: o.shuffleOptions ? shuffle(q.options.map((x) => x.id), rng) : q.options.map((x) => x.id),
    selected: [],
    flagged: false,
    checked: false,
  }));
  return {
    id: uid(),
    kind: o.kind,
    name: o.name,
    examId: o.examId,
    mode: o.mode,
    startedAt: now,
    updatedAt: now,
    elapsedSec: 0,
    limitSec: o.limitSec,
    passPercent: o.passPercent,
    partialCredit: o.partialCredit,
    items,
    index: 0,
  };
}

export function pickRandom<T>(pool: readonly T[], n: number, rng: Rng = Math.random): T[] {
  return shuffle(pool, rng).slice(0, Math.max(0, n));
}

/** Scores a session into an Attempt. Items whose question no longer exists are dropped. */
export function finishSession(
  s: Session,
  byId: ReadonlyMap<string, Question>,
  opts: { now?: number; timedOut?: boolean } = {},
): Attempt {
  const now = opts.now ?? Date.now();
  const items: AttemptItem[] = [];
  for (const it of s.items) {
    const q = byId.get(it.qid);
    if (!q) continue;
    const sc = scoreAnswer(q.correct, it.selected, s.partialCredit);
    items.push({
      qid: q.id,
      lesson: q.lesson,
      topic: q.topic,
      source: q.source,
      type: q.type,
      question: q.question,
      options: q.options.map((o) => ({ ...o })),
      explanation: q.explanation,
      order: it.order.filter((id) => q.options.some((o) => o.id === id)),
      selected: it.selected.slice(),
      correct: q.correct.slice(),
      points: sc.points,
      isCorrect: sc.isCorrect,
      flagged: it.flagged,
    });
  }
  const t = totals(items, s.passPercent);
  const used = s.limitSec != null ? Math.min(s.elapsedSec, s.limitSec) : s.elapsedSec;
  return {
    id: uid(),
    kind: s.kind,
    name: s.name,
    examId: s.examId,
    mode: s.mode,
    startedAt: s.startedAt,
    finishedAt: now,
    usedSec: Math.round(used),
    limitSec: s.limitSec,
    passPercent: s.passPercent,
    partialCredit: s.partialCredit,
    total: t.total,
    points: t.points,
    percent: t.percent,
    passed: t.passed,
    timedOut: !!opts.timedOut,
    items,
  };
}
