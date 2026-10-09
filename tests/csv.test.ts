import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/core/csv';
import { applyPack, parseCsvPack } from '../src/core/importer';

const H = 'id;source;lesson;topic;question;A;B;C;D;E;F;correct;explanation';

describe('parseCsv', () => {
  it('parses single and multi rows, ignores empty option columns', () => {
    const t = `${H}\nq1;dump;11;IPsec VPN;What?;a;b;c;;;;B;why\nq2;kc;2;Routing;Pick two;a;b;c;d;;;B,D;`;
    const r = parseCsv(t);
    expect(r.invalid).toEqual([]);
    expect(r.rawQuestions).toHaveLength(2);
    const [q1, q2] = r.rawQuestions as any[];
    expect(q1.options.map((o: any) => o.id)).toEqual(['A', 'B', 'C']);
    expect(q1.type).toBe('single');
    expect(q1.explanation).toBe('why');
    expect(q2.type).toBe('multi');
    expect(q2.correct).toEqual(['B', 'D']);
    expect(q2.explanation).toBeUndefined();
  });

  it('handles BOM and CRLF', () => {
    const t = `\uFEFF${H}\r\nq1;dump;1;T;Q;a;b;;;;;A;\r\n`;
    const r = parseCsv(t);
    expect(r.rawQuestions).toHaveLength(1);
  });

  it('reports rows with the wrong number of fields and keeps the rest', () => {
    const t = `${H}\nq1;dump;1;T;Q;a;b;;;;;A;\nbad;row;only\nq3;dump;1;T;Q;a;b;;;;;B;`;
    const r = parseCsv(t);
    expect(r.rawQuestions).toHaveLength(2);
    expect(r.invalid).toHaveLength(1);
    expect(r.invalid[0].ref).toContain('red 3');
    expect(r.invalid[0].reasons[0]).toMatch(/broj polja/);
  });

  it('skips blank lines', () => {
    const r = parseCsv(`${H}\n\nq1;dump;1;T;Q;a;b;;;;;A;\n\n`);
    expect(r.rawQuestions).toHaveLength(1);
  });

  it('rejects a wrong header', () => {
    expect(() => parseCsv('id;source\nq;d')).toThrow(/header/i);
  });

  it('rejects an empty file', () => {
    expect(() => parseCsv('')).toThrow();
  });

  it('lowercase correct letters are accepted', () => {
    const r = parseCsv(`${H}\nq1;dump;1;T;Q;a;b;;;;;b;`);
    expect((r.rawQuestions[0] as any).correct).toEqual(['B']);
  });
});

describe('CSV through the importer', () => {
  it('validation errors in rows are reported with their line number', () => {
    const t = `${H}\nq1;dump;1;T;Q;a;b;;;;;Z;\nq2;dump;1;T;Q;a;b;;;;;A;`;
    const { lib, report } = applyPack({ questions: [], exams: [] }, parseCsvPack(t, 'my file.csv'), { overwrite: false });
    expect(lib.questions.map((q) => q.id)).toEqual(['q2']);
    expect(report.invalid).toHaveLength(1);
    expect(report.invalid[0].ref).toContain('red 2');
    expect(report.pack).toBe('my file');
  });

  it('a lesson that is not a number is rejected', () => {
    const t = `${H}\nq1;dump;abc;T;Q;a;b;;;;;A;`;
    const { report } = applyPack({ questions: [], exams: [] }, parseCsvPack(t, 'x.csv'), { overwrite: false });
    expect(report.invalid).toHaveLength(1);
  });
});
