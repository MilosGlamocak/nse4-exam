export const SOURCES = ['dump', 'kc', 'quiz', 'claude'] as const;
export type Source = (typeof SOURCES)[number];
export type QType = 'single' | 'multi';
export type Mode = 'exam' | 'practice';
export type ExamKind = 'fixed' | 'random' | 'custom' | 'retry';

export interface Option {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  source: Source;
  lesson: number;
  topic: string;
  type: QType;
  question: string;
  options: Option[];
  correct: string[];
  explanation?: string;
  image?: string;
  /** name of the pack the question came from (used for "delete pack") */
  pack: string;
  addedAt: number;
}

export interface ExamDef {
  id: string;
  name: string;
  questionIds: string[];
  durationMinutes: number;
  passPercent: number;
  pack: string;
}

/** One question inside a running exam. `order` = original option ids in DISPLAY order. */
export interface SessionItem {
  qid: string;
  order: string[];
  selected: string[]; // original option ids
  flagged: boolean;
  checked: boolean; // practice mode: feedback revealed, answer locked
}

export interface Session {
  id: string;
  kind: ExamKind;
  name: string;
  examId?: string;
  mode: Mode;
  startedAt: number;
  updatedAt: number;
  elapsedSec: number;
  limitSec: number | null;
  passPercent: number;
  partialCredit: boolean;
  items: SessionItem[];
  index: number;
  /** user paused the exam: clock is stopped and questions are hidden until resumed */
  paused?: boolean;
}

/** Snapshot of one answered question inside a finished attempt. */
export interface AttemptItem {
  qid: string;
  lesson: number;
  topic: string;
  source: Source;
  type: QType;
  question: string;
  options: Option[]; // original options (ids + text)
  explanation?: string;
  order: string[]; // original option ids in the order they were displayed
  selected: string[];
  correct: string[];
  points: number;
  isCorrect: boolean;
  flagged: boolean;
}

export interface Attempt {
  id: string;
  kind: ExamKind;
  name: string;
  examId?: string;
  mode: Mode;
  startedAt: number;
  finishedAt: number;
  usedSec: number;
  limitSec: number | null;
  passPercent: number;
  partialCredit: boolean;
  total: number;
  points: number;
  percent: number;
  passed: boolean;
  timedOut: boolean;
  items: AttemptItem[];
}

export interface Settings {
  theme: 'auto' | 'light' | 'dark';
  partialCredit: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  random: { count: number; minutes: number; passPercent: number };
}

export interface Meta {
  lastBackupAt: number | null;
  bannerSnoozedUntil: number | null;
  /** names of bundled packs that were already auto-imported once */
  seenBundled: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  partialCredit: false,
  shuffleQuestions: true,
  shuffleOptions: true,
  random: { count: 55, minutes: 90, passPercent: 80 },
};

export const DEFAULT_META: Meta = { lastBackupAt: null, bannerSnoozedUntil: null, seenBundled: [] };
