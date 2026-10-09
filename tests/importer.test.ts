import { describe, expect, it } from 'vitest';
import { applyPack, parseJsonPack, parsePack } from '../src/core/importer';
import { mkQ, rawQ } from './helpers';

const empty = { questions: [], exams: [] };
const pack = (o: Record<string, unknown>) => JSON.stringify(o);

describe('parseJsonPack', () => {
  it('uses the pack name from the file, falls back to the file name', () => {
    expect(parseJsonPack(pack({ pack: 'dumps-1', questions: [] }), 'x.json').pack).toBe('dumps-1');
    expect(parseJsonPack(pack({ questions: [] }), 'C:\\dir\\my-pack.json').pack).toBe('my-pack');
  });
  it('rejects invalid JSON, arrays, and packs without questions/exams', () => {
    expect(() => parseJsonPack('{oops', 'x.json')).toThrow(/JSON/);
    expect(() => parseJsonPack('[]', 'x.json')).toThrow();
    expect(() => parseJsonPack('{}', 'x.json')).toThrow();
    expect(() => parseJsonPack(pack({ questions: 5 }), 'x.json')).toThrow();
  });
  it('recognises backup files and refuses them', () => {
    expect(() => parseJsonPack(pack({ app: 'nse4-exam-backup', questions: [] }), 'x.json')).toThrow(/backup/i);
  });
  it('strips a BOM', () => {
    expect(parseJsonPack('\uFEFF' + pack({ questions: [] }), 'x.json').questions).toEqual([]);
  });
  it('parsePack picks the parser from the extension / content', () => {
    expect(parsePack(pack({ questions: [] }), 'a.json').format).toBe('json');
    expect(parsePack('id;source;lesson;topic;question;A;B;C;D;E;F;correct;explanation', 'a.csv').format).toBe('csv');
    expect(parsePack(pack({ questions: [] }), 'a.txt').format).toBe('json');
  });
});

describe('applyPack', () => {
  it('adds valid questions and reports invalid ones individually', () => {
    const p = parseJsonPack(
      pack({
        pack: 'p1',
        questions: [rawQ({ id: 'a' }), rawQ({ id: 'b', correct: ['Z'] }), rawQ({ id: 'c' })],
      }),
      'f.json',
    );
    const { lib, report } = applyPack(empty, p, { overwrite: false });
    expect(lib.questions.map((q) => q.id)).toEqual(['a', 'c']);
    expect(report.addedQuestions).toBe(2);
    expect(report.invalid).toHaveLength(1);
    expect(report.invalid[0].ref).toContain('b');
    expect(lib.questions[0].pack).toBe('p1');
  });

  it('is additive: existing ids are skipped by default', () => {
    const lib0 = { questions: [mkQ('a', { question: 'old' })], exams: [] };
    const p = parseJsonPack(pack({ questions: [rawQ({ id: 'a', question: 'new' }), rawQ({ id: 'n' })] }), 'f.json');
    const { lib, report } = applyPack(lib0, p, { overwrite: false });
    expect(lib.questions).toHaveLength(2);
    expect(lib.questions.find((q) => q.id === 'a')!.question).toBe('old');
    expect(report.skippedQuestions).toBe(1);
    expect(report.addedQuestions).toBe(1);
    expect(lib0.questions).toHaveLength(1); // input not mutated
  });

  it('overwrites when asked to', () => {
    const lib0 = { questions: [mkQ('a', { question: 'old' })], exams: [] };
    const p = parseJsonPack(pack({ questions: [rawQ({ id: 'a', question: 'new' })] }), 'f.json');
    const { lib, report } = applyPack(lib0, p, { overwrite: true });
    expect(lib.questions).toHaveLength(1);
    expect(lib.questions[0].question).toBe('new');
    expect(report.overwrittenQuestions).toBe(1);
  });

  it('rejects the second of two identical ids inside one file', () => {
    const p = parseJsonPack(pack({ questions: [rawQ({ id: 'a' }), rawQ({ id: 'a' })] }), 'f.json');
    const { lib, report } = applyPack(empty, p, { overwrite: false });
    expect(lib.questions).toHaveLength(1);
    expect(report.invalid[0].reasons[0]).toMatch(/duplikat/);
  });

  it('imports exams, skips duplicates, rejects bad ones and warns about unknown questions', () => {
    const exams = [
      { id: 'e1', name: 'Ispit 1', questionIds: ['a', 'ghost'], durationMinutes: 105, passPercent: 70 },
      { id: 'e2', name: 'Bad', questionIds: [], durationMinutes: 105, passPercent: 70 },
    ];
    const p = parseJsonPack(pack({ pack: 'p', questions: [rawQ({ id: 'a' })], exams }), 'f.json');
    const r1 = applyPack(empty, p, { overwrite: false });
    expect(r1.lib.exams.map((e) => e.id)).toEqual(['e1']);
    expect(r1.report.addedExams).toBe(1);
    expect(r1.report.invalid.some((i) => i.kind === 'exam')).toBe(true);
    expect(r1.report.warnings[0]).toMatch(/1 od 2/);
    const r2 = applyPack(r1.lib, p, { overwrite: false });
    expect(r2.report.skippedExams).toBe(1);
    expect(r2.report.skippedQuestions).toBe(1);
  });

  it('a pack with only exams (no questions) is accepted', () => {
    const p = parseJsonPack(
      pack({ exams: [{ id: 'e', name: 'E', questionIds: ['x'], durationMinutes: 10, passPercent: 50 }] }),
      'f.json',
    );
    const { lib } = applyPack(empty, p, { overwrite: false });
    expect(lib.exams).toHaveLength(1);
  });
});
