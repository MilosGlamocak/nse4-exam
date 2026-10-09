import type { Attempt, AttemptItem } from '../types';
import { breakdown } from './stats';
import { idsToLetters } from './scoring';
import { LETTERS, fmtDuration, fmtPercent } from './util';

function lettersStr(order: readonly string[], ids: readonly string[]): string {
  const l = idsToLetters(order, ids);
  return l.length ? l.join(', ') : '(bez odgovora)';
}

function itemBlock(it: AttemptItem, n: number): string {
  const tags = [it.isCorrect ? 'TACNO' : 'POGRESNO'];
  if (it.flagged) tags.push('FLAGGED');
  const lines: string[] = [];
  lines.push(`[${n}] id=${it.qid} | L${it.lesson} | ${it.topic} | ${it.source} | ${tags.join('+')}`);
  lines.push(`Q: ${it.question.trim()}`);
  const optText = new Map(it.options.map((o) => [o.id, o.text] as const));
  it.order.forEach((id, i) => lines.push(`${LETTERS[i]}) ${(optText.get(id) ?? '').trim()}`));
  lines.push(`Moj odgovor: ${lettersStr(it.order, it.selected)}`);
  lines.push(`Tacan odgovor: ${lettersStr(it.order, it.correct)}`);
  return lines.join('\n');
}

/** Compact plain-text block to paste into a chat: score, breakdown, wrong/flagged questions. */
export function buildClaudeExport(a: Attempt): string {
  const out: string[] = [];
  const limit = a.limitSec != null ? ` / ${fmtDuration(a.limitSec)}` : '';
  out.push(
    `NSE4 rezultat: ${a.name} | mod: ${a.mode === 'exam' ? 'exam' : 'practice'} | ` +
      `${Math.round(a.points * 100) / 100}/${a.total} (${fmtPercent(a.percent)}) | ` +
      `${a.passed ? 'PROLAZ' : 'PAD'} (prag ${a.passPercent}%) | vrijeme ${fmtDuration(a.usedSec)}${limit}`,
  );
  const bt = breakdown(a.items, 'topic')
    .map((b) => `${b.label} ${Math.round(b.correct * 100) / 100}/${b.total} (${Math.round(b.percent)}%)`)
    .join('; ');
  const bl = breakdown(a.items, 'lesson')
    .map((b) => `L${b.key} ${Math.round(b.correct * 100) / 100}/${b.total} (${Math.round(b.percent)}%)`)
    .join('; ');
  out.push(`Po lekcijama: ${bl}`);
  out.push(`Po temama: ${bt}`);
  const picked = a.items.filter((it) => !it.isCorrect || it.flagged);
  out.push('');
  if (!picked.length) {
    out.push('Nema pogresnih ni oznacenih pitanja.');
  } else {
    out.push(`Pogresna/oznacena pitanja (${picked.length}). Slova opcija odgovaraju redoslijedu u kojem sam ih vidio.`);
    out.push('');
    picked.forEach((it, i) => {
      out.push(itemBlock(it, i + 1));
      out.push('');
    });
  }
  out.push('Molim objasni zasto je tacan odgovor tacan i zasto je moj bio pogresan.');
  return out.join('\n').trimEnd() + '\n';
}
