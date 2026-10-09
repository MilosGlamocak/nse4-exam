export const CSV_HEADER = ['id', 'source', 'lesson', 'topic', 'question', 'A', 'B', 'C', 'D', 'E', 'F', 'correct', 'explanation'];
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export interface CsvProblem {
  ref: string;
  reasons: string[];
}

export interface CsvParsed {
  rawQuestions: unknown[];
  /** parallel to rawQuestions: the CSV line number each one came from */
  lines: number[];
  invalid: CsvProblem[];
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Semicolon-separated, UTF-8 (BOM optional), header row required.
 * Plain split on ";" (the format guarantees the delimiter never appears inside fields).
 * Rows with the wrong number of fields are reported and skipped.
 * Throws Error on a missing/mismatched header (whole file is unusable then).
 */
export function parseCsv(text: string): CsvParsed {
  const lines = stripBom(text).split(/\r\n|\n|\r/);
  let headerIdx = lines.findIndex((l) => l.trim() !== '');
  if (headerIdx < 0) throw new Error('CSV je prazan');
  const header = lines[headerIdx].split(';').map((h) => h.trim());
  const expected = CSV_HEADER.map((h) => h.toLowerCase());
  const got = header.map((h) => h.toLowerCase());
  if (got.length !== expected.length || got.some((h, i) => h !== expected[i])) {
    throw new Error(`Neispravan header. Očekivano: ${CSV_HEADER.join(';')}`);
  }

  const rawQuestions: unknown[] = [];
  const lineNos: number[] = [];
  const invalid: CsvProblem[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const f = line.split(';');
    const lineNo = i + 1;
    if (f.length !== CSV_HEADER.length) {
      invalid.push({
        ref: `red ${lineNo}${f[0]?.trim() ? ` (${f[0].trim()})` : ''}`,
        reasons: [`pogrešan broj polja: ${f.length}, očekivano ${CSV_HEADER.length}`],
      });
      continue;
    }
    const [id, source, lessonStr, topic, question] = f;
    const opts = OPTION_LETTERS.map((l, k) => ({ id: l, text: f[5 + k].trim() })).filter((o) => o.text !== '');
    const correct = f[11]
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    const lesson = /^\s*\d+\s*$/.test(lessonStr) ? parseInt(lessonStr, 10) : NaN;
    const q: Record<string, unknown> = {
      id: id.trim(),
      source: source.trim().toLowerCase(),
      lesson,
      topic: topic.trim(),
      type: correct.length > 1 ? 'multi' : 'single',
      question: question.trim(),
      options: opts,
      correct,
    };
    const expl = f[12].trim();
    if (expl) q.explanation = expl;
    rawQuestions.push(q);
    lineNos.push(lineNo);
  }
  return { rawQuestions, lines: lineNos, invalid };
}
