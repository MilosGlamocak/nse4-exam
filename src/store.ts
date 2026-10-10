import { effect, signal, batch } from '@preact/signals';
import {
  DEFAULT_META,
  DEFAULT_SETTINGS,
  type Attempt,
  type ExamDef,
  type Meta,
  type Mode,
  type Question,
  type Session,
  type Settings,
  type ExamKind,
} from './types';
import { initStorage, loadKey, lsRead, lsWrite, removeKey, saveKey } from './storage';
import { applyPack, parsePack, type ImportReport } from './core/importer';
import { BUNDLED } from './bundled';
import { buildSession, finishSession, pickRandom } from './core/session';
import { makeBackup, parseBackup, type AppData } from './core/backup';
import { makeHistoryExport, mergeHistory, parseHistoryImport } from './core/historyIo';
import { scoreAnswer } from './core/scoring';

export type Route =
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'history' }
  | { name: 'settings' }
  | { name: 'custom' }
  | { name: 'run' }
  | { name: 'results'; attemptId: string };

export const route = signal<Route>({ name: 'home' });
export const questions = signal<Question[]>([]);
export const exams = signal<ExamDef[]>([]);
export const history = signal<Attempt[]>([]);
export const settings = signal<Settings>(DEFAULT_SETTINGS);
export const meta = signal<Meta>(DEFAULT_META);
export const session = signal<Session | null>(null);
export const ready = signal(false);
/** one-line message shown after bundled packs were auto-imported */
export const bundledNotice = signal<string | null>(null);

export function go(r: Route): void {
  route.value = r;
  window.scrollTo?.(0, 0);
}

// ---------- boot + persistence ----------

const timers = new Map<string, number>();
function debounced(key: string, value: unknown, ms = 250) {
  const t = timers.get(key);
  if (t) clearTimeout(t);
  timers.set(
    key,
    window.setTimeout(() => {
      timers.delete(key);
      void saveKey(key, value);
    }, ms),
  );
}

export function flushPending(): void {
  // fire any waiting debounced writes immediately (tab hidden / closing)
  for (const [key, t] of [...timers]) {
    clearTimeout(t);
    timers.delete(key);
    const v = { questions, exams, history, settings, meta, session }[key as 'questions'];
    void saveKey(key, v.value);
  }
}

export async function boot(): Promise<void> {
  await initStorage();
  const [q, e, h, s, m, sess] = await Promise.all([
    loadKey<Question[]>('questions', []),
    loadKey<ExamDef[]>('exams', []),
    loadKey<Attempt[]>('history', []),
    loadKey<Settings>('settings', DEFAULT_SETTINGS),
    loadKey<Meta>('meta', DEFAULT_META),
    loadKey<Session | null>('session', null),
  ]);
  const mirror = lsRead<Session>('session');
  let live: Session | null = sess ?? null;
  if (mirror && (!live || (mirror.updatedAt ?? 0) > (live.updatedAt ?? 0))) live = mirror;
  // saved settings still holding the old built-in random-exam defaults (60 q / 105 min / 70 %) follow the new ones
  const r = s.random;
  if (r && r.count === 60 && r.minutes === 105 && r.passPercent === 70) s.random = { ...DEFAULT_SETTINGS.random };
  batch(() => {
    questions.value = q;
    exams.value = e;
    history.value = h;
    settings.value = { ...DEFAULT_SETTINGS, ...s, random: { ...DEFAULT_SETTINGS.random, ...(s.random ?? {}) } };
    meta.value = { ...DEFAULT_META, ...m };
    session.value = live && Array.isArray(live.items) ? live : null;
    if (session.value && !session.value.paused) route.value = { name: 'run' };
    ready.value = true;
  });

  // persist on change (effects run once immediately - skip that first run via the `first` flags)
  const wire = <T,>(key: string, sig: { value: T }, ms?: number) => {
    let first = true;
    effect(() => {
      const v = sig.value;
      if (first) {
        first = false;
        return;
      }
      debounced(key, v, ms);
    });
  };
  wire('questions', questions, 150);
  wire('exams', exams, 150);
  wire('history', history, 150);
  wire('settings', settings);
  wire('meta', meta);
  let firstSess = true;
  effect(() => {
    const v = session.value;
    if (firstSess) {
      firstSess = false;
      return;
    }
    lsWrite('session', v); // sync mirror
    if (v == null) {
      const t = timers.get('session');
      if (t) clearTimeout(t);
      timers.delete('session');
      void removeKey('session');
    } else debounced('session', v, 400);
  });

  importBundled(false);

  const flush = () => flushPending();
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

// ---------- bundled packs ----------

/**
 * Imports packs baked into the HTML. `force` = also those already imported/deleted before
 * (the "restore built-in packs" button). Overwrites questions with the same id: the bundled
 * file is the source of truth for its own pack.
 */
export function importBundled(force: boolean): void {
  const seen = new Set(force ? [] : meta.value.seenBundled);
  let lib = { questions: questions.value, exams: exams.value };
  let added = 0;
  const names: string[] = [];
  for (const b of BUNDLED) {
    if (seen.has(b.pack)) continue;
    try {
      const out = applyPack(lib, parsePack(b.text, b.file), { overwrite: true });
      lib = out.lib;
      added += out.report.addedQuestions + out.report.overwrittenQuestions;
      if (out.report.invalid.length) console.warn(`[${b.file}] nevažeći zapisi:`, out.report.invalid);
    } catch (e) {
      console.warn(`[${b.file}] uvoz nije uspeo:`, e);
      continue;
    }
    seen.add(b.pack);
    names.push(b.pack);
  }
  if (!names.length) return;
  batch(() => {
    questions.value = lib.questions;
    exams.value = lib.exams;
    meta.value = { ...meta.value, seenBundled: [...new Set([...meta.value.seenBundled, ...names])] };
    bundledNotice.value = `Ugrađeni paketi učitani: ${names.join(', ')} (${added} pitanja).`;
  });
}

// ---------- derived helpers ----------

export function questionMap(): Map<string, Question> {
  return new Map(questions.value.map((q) => [q.id, q] as const));
}

// ---------- import / delete ----------

export interface FileImportResult {
  file: string;
  error?: string;
  report?: ImportReport;
}

export async function importFiles(files: File[], overwrite: boolean): Promise<FileImportResult[]> {
  const results: FileImportResult[] = [];
  let lib = { questions: questions.value, exams: exams.value };
  for (const f of files) {
    try {
      const text = await f.text();
      const parsed = parsePack(text, f.name);
      const out = applyPack(lib, parsed, { overwrite });
      lib = out.lib;
      results.push({ file: f.name, report: out.report });
    } catch (e) {
      results.push({ file: f.name, error: (e as Error).message });
    }
  }
  batch(() => {
    questions.value = lib.questions;
    exams.value = lib.exams;
  });
  return results;
}

export function importText(text: string, fileName: string, overwrite: boolean): FileImportResult {
  try {
    const out = applyPack({ questions: questions.value, exams: exams.value }, parsePack(text, fileName), { overwrite });
    batch(() => {
      questions.value = out.lib.questions;
      exams.value = out.lib.exams;
    });
    return { file: fileName, report: out.report };
  } catch (e) {
    return { file: fileName, error: (e as Error).message };
  }
}

export function deleteQuestion(id: string): void {
  questions.value = questions.value.filter((q) => q.id !== id);
}

export function deletePack(pack: string): void {
  batch(() => {
    questions.value = questions.value.filter((q) => q.pack !== pack);
    exams.value = exams.value.filter((e) => e.pack !== pack);
  });
}

export function deleteAttempt(id: string): void {
  history.value = history.value.filter((a) => a.id !== id);
}

// ---------- starting exams ----------

export interface StartOpts {
  kind: ExamKind;
  name: string;
  examId?: string;
  mode: Mode;
  pool: Question[];
  limitSec: number | null;
  passPercent: number;
}

export function startSession(o: StartOpts): boolean {
  if (!o.pool.length) return false;
  const st = settings.value;
  session.value = buildSession({
    kind: o.kind,
    name: o.name,
    examId: o.examId,
    mode: o.mode,
    questions: o.pool,
    limitSec: o.limitSec,
    passPercent: o.passPercent,
    partialCredit: st.partialCredit,
    shuffleQuestions: st.shuffleQuestions,
    shuffleOptions: st.shuffleOptions,
  });
  go({ name: 'run' });
  return true;
}

export function startFixed(exam: ExamDef, mode: Mode): boolean {
  const map = questionMap();
  const pool = exam.questionIds.map((id) => map.get(id)).filter((q): q is Question => !!q);
  return startSession({
    kind: 'fixed',
    name: exam.name,
    examId: exam.id,
    mode,
    pool,
    limitSec: mode === 'exam' ? Math.round(exam.durationMinutes * 60) : null,
    passPercent: exam.passPercent,
  });
}

export function startRandom(mode: Mode, count: number, minutes: number, passPercent: number): boolean {
  const pool = pickRandom(questions.value, count);
  return startSession({
    kind: 'random',
    name: `Nasumični ispit (${pool.length})`,
    mode,
    pool,
    limitSec: mode === 'exam' ? Math.round(minutes * 60) : null,
    passPercent,
  });
}

export function startRetryWrong(a: Attempt, mode: Mode): boolean {
  const map = questionMap();
  const pool = a.items
    .filter((i) => !i.isCorrect)
    .map((i) => map.get(i.qid))
    .filter((q): q is Question => !!q);
  const sec = a.limitSec != null && a.total > 0 ? Math.round((a.limitSec / a.total) * pool.length) : null;
  return startSession({
    kind: 'retry',
    name: `Ponavljanje pogrešnih – ${a.name}`,
    mode,
    pool,
    limitSec: mode === 'exam' ? sec : null,
    passPercent: a.passPercent,
  });
}

// ---------- session actions ----------

function patchSession(fn: (s: Session) => Session): void {
  const s = session.value;
  if (!s) return;
  session.value = { ...fn(s), updatedAt: Date.now() };
}

export function setIndex(i: number): void {
  patchSession((s) => ({ ...s, index: Math.max(0, Math.min(s.items.length - 1, i)) }));
}

export function setElapsed(sec: number): void {
  patchSession((s) => ({ ...s, elapsedSec: sec }));
}

/** Stops the clock and hides the questions; the exam stays saved until resumed. */
export function pauseSession(): void {
  patchSession((s) => ({ ...s, paused: true }));
}

export function resumeSession(): void {
  patchSession((s) => ({ ...s, paused: false }));
  go({ name: 'run' });
}

export function toggleOption(itemIndex: number, optionId: string, isMulti: boolean): void {
  patchSession((s) => {
    const it = s.items[itemIndex];
    if (!it || it.checked) return s;
    let sel: string[];
    if (isMulti) sel = it.selected.includes(optionId) ? it.selected.filter((x) => x !== optionId) : [...it.selected, optionId];
    else sel = [optionId];
    const items = s.items.slice();
    items[itemIndex] = { ...it, selected: sel };
    return { ...s, items };
  });
}

export function toggleFlag(itemIndex: number): void {
  patchSession((s) => {
    const items = s.items.slice();
    items[itemIndex] = { ...items[itemIndex], flagged: !items[itemIndex].flagged };
    return { ...s, items };
  });
}

export function checkAnswer(itemIndex: number): void {
  patchSession((s) => {
    const items = s.items.slice();
    if (!items[itemIndex].selected.length) return s;
    items[itemIndex] = { ...items[itemIndex], checked: true };
    return { ...s, items };
  });
}

/** Scores and stores the attempt, clears the session, navigates to results. */
export function submitSession(timedOut = false): string | null {
  const s = session.value;
  if (!s) return null;
  const a = finishSession(s, questionMap(), { timedOut });
  batch(() => {
    history.value = [...history.value, a];
    session.value = null;
  });
  flushPending();
  go({ name: 'results', attemptId: a.id });
  return a.id;
}

export function abandonSession(): void {
  session.value = null;
  go({ name: 'home' });
}

export function liveScore(s: Session, q: Question) {
  const it = s.items.find((i) => i.qid === q.id)!;
  return scoreAnswer(q.correct, it.selected, s.partialCredit);
}

// ---------- backup ----------

export function currentData(): AppData {
  return { questions: questions.value, exams: exams.value, history: history.value, settings: settings.value };
}

export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function dateStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export function exportBackup(): void {
  downloadText(`nse4-backup-${dateStamp()}.json`, makeBackup(currentData()));
  meta.value = { ...meta.value, lastBackupAt: Date.now(), bannerSnoozedUntil: null };
}

export function exportHistory(): void {
  downloadText(`nse4-istorija-${dateStamp()}.json`, makeHistoryExport(history.value));
}

/** Merges attempts from a history export / full backup into the current history (existing ids are kept). */
export function importHistory(text: string): { added: number; skipped: number; dropped: number } {
  const { attempts, dropped } = parseHistoryImport(text);
  const m = mergeHistory(history.value, attempts);
  history.value = m.history;
  return { added: m.added, skipped: m.skipped, dropped };
}

export function restoreBackup(text: string): { dropped: number } {
  const r = parseBackup(text);
  batch(() => {
    questions.value = r.data.questions;
    exams.value = r.data.exams;
    history.value = r.data.history;
    settings.value = r.data.settings;
    session.value = null;
  });
  return { dropped: r.dropped };
}

export function wipeAll(): void {
  batch(() => {
    questions.value = [];
    exams.value = [];
    history.value = [];
    session.value = null;
    settings.value = DEFAULT_SETTINGS;
  });
}

export function snoozeBackupBanner(days = 1): void {
  meta.value = { ...meta.value, bannerSnoozedUntil: Date.now() + days * 24 * 3600 * 1000 };
}
