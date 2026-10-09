import { describe, expect, it } from 'vitest';
import { validateExam, validateQuestion } from '../src/core/validate';
import { rawQ } from './helpers';

const v = (o: Record<string, unknown> = {}) => validateQuestion(rawQ(o), 'pk', 123);
const errs = (o: Record<string, unknown>) => {
  const r = v(o);
  return r.ok ? [] : r.errors;
};

describe('validateQuestion', () => {
  it('accepts a valid single question and normalises it', () => {
    const r = v({ id: '  q1  ' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.id).toBe('q1');
      expect(r.value.pack).toBe('pk');
      expect(r.value.addedAt).toBe(123);
      expect(r.value.explanation).toBeUndefined();
    }
  });

  it('accepts a valid multi question', () => {
    expect(v({ type: 'multi', correct: ['A', 'C'] }).ok).toBe(true);
  });

  it('accepts explanation and an image data URI', () => {
    const r = v({ explanation: 'because', image: 'data:image/png;base64,iVBORw0KGgo=' });
    expect(r.ok && r.value.explanation).toBe('because');
    expect(r.ok && r.value.image).toContain('data:image/png');
  });

  it.each([
    ['id', { id: '' }],
    ['source', { source: 'internet' }],
    ['lesson 0', { lesson: 0 }],
    ['lesson 17', { lesson: 17 }],
    ['lesson float', { lesson: 2.5 }],
    ['lesson string', { lesson: '3' }],
    ['topic', { topic: '  ' }],
    ['type', { type: 'maybe' }],
    ['question', { question: '' }],
    ['options not array', { options: 'x' }],
    ['one option', { options: [{ id: 'A', text: 'x' }], correct: ['A'] }],
    ['empty correct', { correct: [] }],
  ])('rejects bad %s', (_n, over) => {
    expect(errs(over).length).toBeGreaterThan(0);
  });

  it('rejects duplicate option ids', () => {
    const e = errs({
      options: [
        { id: 'A', text: 'x' },
        { id: 'A', text: 'y' },
      ],
      correct: ['A'],
    });
    expect(e.join()).toMatch(/duplikat option id/);
  });

  it('rejects correct that references a missing option', () => {
    expect(errs({ correct: ['Z'] }).join()).toMatch(/nepostojeće/);
  });

  it('rejects single with 2 correct', () => {
    expect(errs({ type: 'single', correct: ['A', 'B'] }).join()).toMatch(/single/);
  });

  it('rejects multi with 1 correct', () => {
    expect(errs({ type: 'multi', correct: ['A'] }).join()).toMatch(/multi/);
  });

  it('rejects duplicated correct ids', () => {
    expect(errs({ type: 'multi', correct: ['A', 'A'] }).join()).toMatch(/duplikate/);
  });

  it('rejects non-data image', () => {
    expect(errs({ image: 'http://x/y.png' }).join()).toMatch(/image/);
  });

  it('rejects non-objects', () => {
    expect(validateQuestion(null, 'p').ok).toBe(false);
    expect(validateQuestion('x', 'p').ok).toBe(false);
  });

  it('collects several errors at once', () => {
    expect(errs({ id: '', lesson: 99, correct: [] }).length).toBeGreaterThanOrEqual(3);
  });
});

describe('validateExam', () => {
  const ok = { id: 'e1', name: 'Ispit 1', questionIds: ['a', 'b'], durationMinutes: 105, passPercent: 70 };
  it('accepts a valid exam', () => expect(validateExam(ok, 'p').ok).toBe(true));
  it.each([
    ['no id', { id: '' }],
    ['no name', { name: '' }],
    ['empty ids', { questionIds: [] }],
    ['dup ids', { questionIds: ['a', 'a'] }],
    ['bad duration', { durationMinutes: 0 }],
    ['bad pass', { passPercent: 101 }],
  ])('rejects %s', (_n, over) => expect(validateExam({ ...ok, ...over }, 'p').ok).toBe(false));
});
