export type Rng = () => number;

/** Fisher-Yates, returns a new array. */
export function shuffle<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function uid(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

/** Deterministic PRNG for tests. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${pad2(m)}:${pad2(sec)}`;
}

export function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function fmtPercent(p: number): string {
  return (Math.round(p * 10) / 10).toString().replace('.', ',') + '%';
}

const NUM_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** "Choose one" / "Choose two" ... like the real exam. */
export function chooseLabel(n: number): string {
  return 'Choose ' + (NUM_WORDS[n] ?? String(n));
}

/** Points with at most 2 decimals and a decimal comma, e.g. 41,5 */
export function fmtPts(n: number): string {
  return (Math.round(n * 100) / 100).toString().replace('.', ',');
}
