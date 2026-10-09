import { describe, expect, it } from 'vitest';
import { idsToLetters, lettersToIds, letterOf, scoreAnswer, totals } from '../src/core/scoring';
import { buildSession, finishSession } from '../src/core/session';
import { mulberry32 } from '../src/core/util';
import { mkQ } from './helpers';

describe('scoreAnswer - single', () => {
  it('correct = 1', () => expect(scoreAnswer(['B'], ['B'], false)).toEqual({ points: 1, isCorrect: true }));
  it('wrong = 0', () => expect(scoreAnswer(['B'], ['A'], false)).toEqual({ points: 0, isCorrect: false }));
  it('unanswered = 0', () => expect(scoreAnswer(['B'], [], false)).toEqual({ points: 0, isCorrect: false }));
  it('partial credit never applies to single', () => expect(scoreAnswer(['B'], ['A'], true).points).toBe(0));
});

describe('scoreAnswer - multi', () => {
  it('exact set (any order) = 1', () => {
    expect(scoreAnswer(['B', 'D'], ['D', 'B'], false).isCorrect).toBe(true);
  });
  it('only one of two = 0 without partial credit', () => {
    expect(scoreAnswer(['B', 'D'], ['B'], false)).toEqual({ points: 0, isCorrect: false });
  });
  it('one correct + one extra wrong = 0 without partial', () => {
    expect(scoreAnswer(['B', 'D'], ['B', 'A'], false).points).toBe(0);
  });
  it('too many selected (superset) is not correct', () => {
    expect(scoreAnswer(['B', 'D'], ['B', 'D', 'A'], false).isCorrect).toBe(false);
  });
  it('partial credit: 1 of 2 right = 0.5, still not "correct"', () => {
    expect(scoreAnswer(['B', 'D'], ['B'], true)).toEqual({ points: 0.5, isCorrect: false });
  });
  it('partial credit: wrong picks subtract, floor at 0', () => {
    expect(scoreAnswer(['B', 'D'], ['B', 'A'], true).points).toBe(0);
    expect(scoreAnswer(['A', 'B', 'C', 'D'], ['A', 'B', 'C', 'E'], true).points).toBeCloseTo(0.5);
    expect(scoreAnswer(['B', 'D'], ['A', 'C'], true).points).toBe(0);
  });
  it('partial credit: exact is still exactly 1', () => {
    expect(scoreAnswer(['B', 'D'], ['B', 'D'], true).points).toBe(1);
  });
  it('partial credit: empty selection = 0', () => {
    expect(scoreAnswer(['B', 'D'], [], true).points).toBe(0);
  });
});

describe('totals', () => {
  it('computes percent and pass', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ points: i < 42 ? 1 : 0 }));
    const t = totals(items, 70);
    expect(t.percent).toBeCloseTo(70);
    expect(t.passed).toBe(true); // exactly at the threshold passes
  });
  it('fails just below', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ points: i < 41 ? 1 : 0 }));
    expect(totals(items, 70).passed).toBe(false);
  });
  it('empty exam never passes', () => {
    expect(totals([], 0)).toEqual({ total: 0, points: 0, percent: 0, passed: false });
  });
  it('sums fractional points', () => {
    expect(totals([{ points: 0.5 }, { points: 1 }], 50).points).toBe(1.5);
  });
});

describe('shuffled option mapping', () => {
  const order = ['C', 'A', 'D', 'B']; // displayed as A,B,C,D
  it('maps ids to display letters and back', () => {
    expect(letterOf(order, 'C')).toBe('A');
    expect(letterOf(order, 'B')).toBe('D');
    expect(idsToLetters(order, ['B', 'C'])).toEqual(['A', 'D']);
    expect(lettersToIds(order, ['A', 'D'])).toEqual(['C', 'B']);
    expect(lettersToIds(order, ['Z'])).toEqual([]);
  });

  it('buildSession shuffles but keeps a permutation of the original ids; letters stay A..n', () => {
    const q = mkQ('x');
    const s = buildSession({
      kind: 'random', name: 'n', mode: 'exam', questions: [q], limitSec: null, passPercent: 70,
      partialCredit: false, shuffleQuestions: true, shuffleOptions: true, rng: mulberry32(7),
    });
    expect([...s.items[0].order].sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(idsToLetters(s.items[0].order, s.items[0].order)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('can keep the original order when shuffling is off', () => {
    const qs = [mkQ('1'), mkQ('2'), mkQ('3')];
    const s = buildSession({
      kind: 'fixed', name: 'n', mode: 'exam', questions: qs, limitSec: null, passPercent: 70,
      partialCredit: false, shuffleQuestions: false, shuffleOptions: false,
    });
    expect(s.items.map((i) => i.qid)).toEqual(['1', '2', '3']);
    expect(s.items[0].order).toEqual(['A', 'B', 'C', 'D']);
  });

  it('whatever the shuffle, picking the displayed letter of the correct option scores 1', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const q = mkQ('x', { type: 'multi', correct: ['B', 'D'] });
      const s = buildSession({
        kind: 'random', name: 'n', mode: 'exam', questions: [q], limitSec: null, passPercent: 70,
        partialCredit: false, shuffleQuestions: true, shuffleOptions: true, rng: mulberry32(seed),
      });
      const order = s.items[0].order;
      // the user "sees" letters; find which letters hold B and D and click them
      const letters = idsToLetters(order, ['B', 'D']);
      s.items[0].selected = lettersToIds(order, letters);
      const a = finishSession(s, new Map([[q.id, q]]));
      expect(a.items[0].isCorrect).toBe(true);
      expect(a.points).toBe(1);
      // and a wrong pick scores 0
      s.items[0].selected = lettersToIds(order, [idsToLetters(order, ['A'])[0]]);
      expect(finishSession(s, new Map([[q.id, q]])).items[0].isCorrect).toBe(false);
    }
  });
});

describe('finishSession', () => {
  const q1 = mkQ('1');
  const q2 = mkQ('2', { type: 'multi', correct: ['A', 'C'] });
  const byId = new Map([q1, q2].map((q) => [q.id, q] as const));
  const mk = (partial: boolean) => {
    const s = buildSession({
      kind: 'fixed', name: 'Ispit 1', examId: 'e1', mode: 'exam', questions: [q1, q2], limitSec: 6300,
      passPercent: 50, partialCredit: partial, shuffleQuestions: false, shuffleOptions: false,
    });
    s.items[0].selected = ['B'];
    s.items[1].selected = ['A'];
    s.items[1].flagged = true;
    s.elapsedSec = 500;
    return s;
  };

  it('scores without partial credit', () => {
    const a = finishSession(mk(false), byId, { now: 99 });
    expect(a.points).toBe(1);
    expect(a.percent).toBe(50);
    expect(a.passed).toBe(true);
    expect(a.items[1].flagged).toBe(true);
    expect(a.items[1].isCorrect).toBe(false);
    expect(a.usedSec).toBe(500);
    expect(a.finishedAt).toBe(99);
  });

  it('scores with partial credit', () => {
    const a = finishSession(mk(true), byId);
    expect(a.points).toBeCloseTo(1.5);
    expect(a.percent).toBeCloseTo(75);
  });

  it('caps used time at the limit', () => {
    const s = mk(false);
    s.elapsedSec = 9999;
    expect(finishSession(s, byId, { timedOut: true }).usedSec).toBe(6300);
  });

  it('drops items whose question was deleted', () => {
    const a = finishSession(mk(false), new Map([[q1.id, q1]]));
    expect(a.total).toBe(1);
  });

  it('snapshots the question so history survives edits/deletes', () => {
    const a = finishSession(mk(false), byId);
    expect(a.items[0].question).toBe('Q 1');
    expect(a.items[0].options).toHaveLength(4);
  });
});
