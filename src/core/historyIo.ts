import type { Attempt } from '../types';
import { BACKUP_MARK, filterAttempts } from './backup';

export const HISTORY_MARK = 'nse4-exam-history';

export function makeHistoryExport(history: Attempt[], now = Date.now()): string {
  return JSON.stringify({ app: HISTORY_MARK, version: 1, exportedAt: now, history });
}

/** Accepts a history-only export or a full backup file (its `history` part is used). */
export function parseHistoryImport(text: string): { attempts: Attempt[]; dropped: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (e) {
    throw new Error('Fajl nije ispravan JSON: ' + (e as Error).message);
  }
  const d = raw as Record<string, unknown>;
  if (!d || typeof d !== 'object' || (d.app !== HISTORY_MARK && d.app !== BACKUP_MARK)) {
    throw new Error('Ovo nije izvoz istorije ni backup ovog programa.');
  }
  if (!Array.isArray(d.history)) throw new Error('Fajl nema polje history.');
  const attempts = filterAttempts(d.history);
  return { attempts, dropped: d.history.length - attempts.length };
}

/** Adds attempts whose id is not present yet; result stays sorted oldest → newest. */
export function mergeHistory(current: Attempt[], incoming: Attempt[]): { history: Attempt[]; added: number; skipped: number } {
  const have = new Set(current.map((a) => a.id));
  const fresh: Attempt[] = [];
  for (const a of incoming) {
    if (have.has(a.id)) continue;
    have.add(a.id);
    fresh.push(a);
  }
  const history = fresh.length ? [...current, ...fresh].sort((a, b) => a.finishedAt - b.finishedAt) : current;
  return { history, added: fresh.length, skipped: incoming.length - fresh.length };
}
