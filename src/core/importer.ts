import type { ExamDef, Question } from '../types';
import { parseCsv } from './csv';
import { validateExam, validateQuestion } from './validate';

export interface InvalidEntry {
  kind: 'question' | 'exam' | 'csv-row';
  ref: string;
  reasons: string[];
}

export interface ParsedPack {
  format: 'json' | 'csv';
  pack: string;
  questions: unknown[];
  /** line numbers for CSV questions (parallel to `questions`), empty for JSON */
  lines: number[];
  exams: unknown[];
  invalid: InvalidEntry[];
}

export interface ImportReport {
  pack: string;
  addedQuestions: number;
  skippedQuestions: number;
  overwrittenQuestions: number;
  addedExams: number;
  skippedExams: number;
  overwrittenExams: number;
  invalid: InvalidEntry[];
  warnings: string[];
}

export interface LibraryState {
  questions: Question[];
  exams: ExamDef[];
}

function baseName(fileName: string): string {
  return fileName.replace(/^.*[\\/]/, '').replace(/\.(json|csv|txt)$/i, '') || 'pack';
}

export function parseJsonPack(text: string, fileName: string): ParsedPack {
  let data: unknown;
  try {
    data = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (e) {
    throw new Error('JSON nije ispravan: ' + (e as Error).message);
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Korijen JSON-a mora biti objekt sa "questions" i/ili "exams"');
  }
  const d = data as Record<string, unknown>;
  if (d.app === 'nse4-exam-backup') {
    throw new Error('Ovo je backup datoteka. Koristi Postavke → "Vrati iz backupa".');
  }
  if (d.questions === undefined && d.exams === undefined) {
    throw new Error('Paket ne sadrži ni "questions" ni "exams"');
  }
  if (d.questions !== undefined && !Array.isArray(d.questions)) throw new Error('"questions" mora biti niz');
  if (d.exams !== undefined && !Array.isArray(d.exams)) throw new Error('"exams" mora biti niz');
  const pack = typeof d.pack === 'string' && d.pack.trim() ? d.pack.trim() : baseName(fileName);
  return {
    format: 'json',
    pack,
    questions: (d.questions as unknown[]) ?? [],
    lines: [],
    exams: (d.exams as unknown[]) ?? [],
    invalid: [],
  };
}

export function parseCsvPack(text: string, fileName: string): ParsedPack {
  const c = parseCsv(text);
  return {
    format: 'csv',
    pack: baseName(fileName),
    questions: c.rawQuestions,
    lines: c.lines,
    exams: [],
    invalid: c.invalid.map((p) => ({ kind: 'csv-row' as const, ref: p.ref, reasons: p.reasons })),
  };
}

export function parsePack(text: string, fileName: string): ParsedPack {
  const isCsv = /\.csv$/i.test(fileName) || (!/\.json$/i.test(fileName) && !/^\s*[{[]/.test(text.replace(/^﻿/, '')));
  return isCsv ? parseCsvPack(text, fileName) : parseJsonPack(text, fileName);
}

/**
 * Additive merge. New ids are added; existing ids are skipped unless `overwrite`.
 * Invalid questions/exams are rejected one by one, valid ones are kept.
 * Pure: returns new arrays, does not mutate `lib`.
 */
export function applyPack(
  lib: LibraryState,
  parsed: ParsedPack,
  opts: { overwrite: boolean; now?: number },
): { lib: LibraryState; report: ImportReport } {
  const now = opts.now ?? Date.now();
  const report: ImportReport = {
    pack: parsed.pack,
    addedQuestions: 0,
    skippedQuestions: 0,
    overwrittenQuestions: 0,
    addedExams: 0,
    skippedExams: 0,
    overwrittenExams: 0,
    invalid: [...parsed.invalid],
    warnings: [],
  };

  const qIndex = new Map<string, number>();
  const questions = lib.questions.slice();
  questions.forEach((q, i) => qIndex.set(q.id, i));
  const seenInFile = new Set<string>();

  parsed.questions.forEach((raw, i) => {
    const res = validateQuestion(raw, parsed.pack, now);
    const lineRef = parsed.lines[i] ? `red ${parsed.lines[i]}` : `#${i + 1}`;
    if (!res.ok) {
      const rawId = (raw as { id?: unknown } | null)?.id;
      const ref = typeof rawId === 'string' && rawId ? `${rawId} (${lineRef})` : lineRef;
      report.invalid.push({ kind: parsed.format === 'csv' ? 'csv-row' : 'question', ref, reasons: res.errors });
      return;
    }
    const q = res.value;
    if (seenInFile.has(q.id)) {
      report.invalid.push({ kind: 'question', ref: `${q.id} (${lineRef})`, reasons: ['duplikat ID unutar iste datoteke'] });
      return;
    }
    seenInFile.add(q.id);
    const at = qIndex.get(q.id);
    if (at === undefined) {
      qIndex.set(q.id, questions.length);
      questions.push(q);
      report.addedQuestions++;
    } else if (opts.overwrite) {
      questions[at] = q;
      report.overwrittenQuestions++;
    } else {
      report.skippedQuestions++;
    }
  });

  const exams = lib.exams.slice();
  const eIndex = new Map<string, number>();
  exams.forEach((e, i) => eIndex.set(e.id, i));
  const seenExam = new Set<string>();

  parsed.exams.forEach((raw, i) => {
    const res = validateExam(raw, parsed.pack);
    if (!res.ok) {
      const rawId = (raw as { id?: unknown } | null)?.id;
      report.invalid.push({
        kind: 'exam',
        ref: typeof rawId === 'string' && rawId ? rawId : `ispit #${i + 1}`,
        reasons: res.errors,
      });
      return;
    }
    const e = res.value;
    if (seenExam.has(e.id)) {
      report.invalid.push({ kind: 'exam', ref: e.id, reasons: ['duplikat ID ispita unutar iste datoteke'] });
      return;
    }
    seenExam.add(e.id);
    const at = eIndex.get(e.id);
    if (at === undefined) {
      eIndex.set(e.id, exams.length);
      exams.push(e);
      report.addedExams++;
    } else if (opts.overwrite) {
      exams[at] = e;
      report.overwrittenExams++;
    } else {
      report.skippedExams++;
    }
  });

  // Warn about exams that reference questions we do not (yet) have.
  const have = new Set(questions.map((q) => q.id));
  for (const e of exams) {
    if (e.pack !== parsed.pack) continue;
    const missing = e.questionIds.filter((id) => !have.has(id)).length;
    if (missing > 0) report.warnings.push(`Ispit "${e.name}": ${missing} od ${e.questionIds.length} pitanja još nije u biblioteci.`);
  }

  return { lib: { questions, exams }, report };
}
