import type { Attempt, ExamDef, Meta, Question, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { validateExam, validateQuestion } from './validate';

export const BACKUP_MARK = 'nse4-exam-backup';

export interface AppData {
  questions: Question[];
  exams: ExamDef[];
  history: Attempt[];
  settings: Settings;
}

export function makeBackup(d: AppData, now = Date.now()): string {
  return JSON.stringify({ app: BACKUP_MARK, version: 1, exportedAt: now, ...d });
}

export interface RestoreResult {
  data: AppData;
  dropped: number;
}

/** Parses a backup file. Questions/exams are re-validated; broken ones are dropped and counted. */
export function parseBackup(text: string): RestoreResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (e) {
    throw new Error('Backup nije ispravan JSON: ' + (e as Error).message);
  }
  const d = raw as Record<string, unknown>;
  if (!d || typeof d !== 'object' || d.app !== BACKUP_MARK) throw new Error('Ovo nije backup ovog programa.');
  if (!Array.isArray(d.questions) || !Array.isArray(d.exams) || !Array.isArray(d.history)) {
    throw new Error('Backup je nepotpun (nedostaju questions/exams/history).');
  }
  let dropped = 0;
  const questions: Question[] = [];
  for (const q of d.questions as Record<string, unknown>[]) {
    const r = validateQuestion(q, typeof q?.pack === 'string' ? q.pack : 'backup', typeof q?.addedAt === 'number' ? q.addedAt : Date.now());
    if (r.ok) questions.push(r.value);
    else dropped++;
  }
  const exams: ExamDef[] = [];
  for (const e of d.exams as Record<string, unknown>[]) {
    const r = validateExam(e, typeof e?.pack === 'string' ? e.pack : 'backup');
    if (r.ok) exams.push(r.value);
    else dropped++;
  }
  const history = (d.history as Attempt[]).filter(
    (a) => a && typeof a.id === 'string' && Array.isArray(a.items) && typeof a.finishedAt === 'number',
  );
  dropped += (d.history as unknown[]).length - history.length;
  const s = (d.settings ?? {}) as Partial<Settings>;
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...s,
    random: { ...DEFAULT_SETTINGS.random, ...(s.random ?? {}) },
  };
  return { data: { questions, exams, history, settings }, dropped };
}

export function backupMetaAfter(meta: Meta, now = Date.now()): Meta {
  return { ...meta, lastBackupAt: now, bannerSnoozedUntil: null };
}

export const BACKUP_STALE_MS = 7 * 24 * 3600 * 1000;

export function backupDue(meta: Meta, hasData: boolean, now = Date.now()): boolean {
  if (!hasData) return false;
  if (meta.bannerSnoozedUntil && now < meta.bannerSnoozedUntil) return false;
  return meta.lastBackupAt == null || now - meta.lastBackupAt > BACKUP_STALE_MS;
}
