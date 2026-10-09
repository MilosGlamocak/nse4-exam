import { LETTERS } from './util';

export interface AnswerScore {
  points: number; // 0..1
  isCorrect: boolean; // exact set match
}

/**
 * Scores one answer. Everything here works on ORIGINAL option ids (never on display letters).
 * - exact set equality => 1 point
 * - otherwise 0, unless `partial` is on and the question has several correct answers:
 *   points = max(0, (right picks - wrong picks) / correct.length)
 */
export function scoreAnswer(correct: readonly string[], selected: readonly string[], partial: boolean): AnswerScore {
  const c = new Set(correct);
  const s = new Set(selected);
  const hits = [...s].filter((x) => c.has(x)).length;
  const wrong = s.size - hits;
  const isCorrect = s.size === c.size && hits === c.size;
  if (isCorrect) return { points: 1, isCorrect: true };
  if (partial && c.size > 1 && s.size > 0) {
    return { points: Math.max(0, (hits - wrong) / c.size), isCorrect: false };
  }
  return { points: 0, isCorrect: false };
}

export interface Totals {
  total: number;
  points: number;
  percent: number;
  passed: boolean;
}

export function totals(items: readonly { points: number }[], passPercent: number): Totals {
  const total = items.length;
  const points = items.reduce((a, b) => a + b.points, 0);
  const percent = total === 0 ? 0 : (points / total) * 100;
  // small epsilon so 42/60 vs 70% style float noise never flips a result
  return { total, points, percent, passed: total > 0 && percent + 1e-9 >= passPercent };
}

/** Display letter ("A", "B", ...) for a given option id in a shuffled order. */
export function letterOf(order: readonly string[], optionId: string): string {
  const i = order.indexOf(optionId);
  return i < 0 ? '?' : LETTERS[i];
}

/** Original option ids -> display letters, sorted alphabetically. */
export function idsToLetters(order: readonly string[], ids: readonly string[]): string[] {
  return ids.map((id) => letterOf(order, id)).sort();
}

/** Display letters -> original option ids (unknown letters are dropped). */
export function lettersToIds(order: readonly string[], letters: readonly string[]): string[] {
  const out: string[] = [];
  for (const l of letters) {
    const i = LETTERS.indexOf(l.toUpperCase());
    if (i >= 0 && i < order.length) out.push(order[i]);
  }
  return out;
}
