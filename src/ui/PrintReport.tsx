import { render } from 'preact';
import type { Attempt, AttemptItem } from '../types';
import { idsToLetters } from '../core/scoring';
import { LETTERS, chooseLabel, fmtDate, fmtDuration, fmtPercent, fmtPts } from '../core/util';

export const PRINT_CONTEXT = 'NSE4 / FortiOS 7.6 priprema, projekat Mreze. Ključevi iz dump pitanja su neslužbeni.';

/** Wrong or flagged questions of an attempt, in their original order. */
export function reportItems(a: Attempt): { it: AttemptItem; no: number }[] {
  return a.items.map((it, i) => ({ it, no: i + 1 })).filter(({ it }) => !it.isCorrect || it.flagged);
}

function PrintItem({ it, no, image }: { it: AttemptItem; no: number; image?: string }) {
  const text = new Map(it.options.map((o) => [o.id, o.text] as const));
  const mine = idsToLetters(it.order, it.selected);
  const right = idsToLetters(it.order, it.correct);
  return (
    <section class="pr-item">
      <div class="pr-meta">
        <b>#{no}</b> · Lekcija {it.lesson} · {it.topic} · izvor: {it.source} · {it.qid}
        {!it.isCorrect && <span class="pr-tag bad"> NETAČNO{it.points > 0 ? ` (${Math.round(it.points * 100)}%)` : ''}</span>}
        {it.flagged && <span class="pr-tag"> ⚑ OZNAČENO</span>}
      </div>
      <div class="pr-q">{it.question}</div>
      {image && <img class="pr-img" src={image} alt="Exhibit" />}
      <div class="pr-choose">{chooseLabel(it.correct.length)}</div>
      <ol class="pr-opts">
        {it.order.map((id, i) => {
          const sel = it.selected.includes(id);
          const ok = it.correct.includes(id);
          const tag = ok && sel ? '✓ tvoj odgovor, tačno' : ok ? '✓ tačan odgovor' : sel ? '✗ tvoj odgovor' : '';
          return (
            <li key={id} class={ok ? 'ok' : sel ? 'ko' : ''}>
              <span class="pr-letter">{LETTERS[i]}</span>
              <span class="pr-txt">{text.get(id)}</span>
              {tag && <span class="pr-opttag">{tag}</span>}
            </li>
          );
        })}
      </ol>
      <p class="pr-ans">
        Tvoj odgovor: <b>{mine.length ? mine.join(', ') : '(bez odgovora)'}</b> · Tačan odgovor: <b>{right.join(', ')}</b>
      </p>
      {it.explanation && (
        <p class="pr-expl"><b>Napomena:</b> {it.explanation}</p>
      )}
    </section>
  );
}

export function PrintReport({ a, images }: { a: Attempt; images: Map<string, string | undefined> }) {
  const items = reportItems(a);
  const wrong = a.items.filter((i) => !i.isCorrect).length;
  const flagged = a.items.filter((i) => i.flagged).length;
  return (
    <div class="pr">
      <p class="pr-context">{PRINT_CONTEXT}</p>
      <h1>{a.name}</h1>
      <p class="pr-summary">
        {a.mode === 'exam' ? 'Ispit' : 'Vežba'} · {fmtDate(a.finishedAt)} · rezultat <b>{fmtPercent(a.percent)}</b> ({fmtPts(a.points)}/{a.total}) ·{' '}
        <b>{a.passed ? 'PROLAZ' : 'PAD'}</b> (prag {a.passPercent}%) · vreme {fmtDuration(a.usedSec)}
        {a.limitSec != null && ` / ${fmtDuration(a.limitSec)}`}
        <br />
        Pogrešnih: {wrong} · označenih: {flagged} · u izvozu: {items.length}
      </p>
      {items.length === 0 && <p>Nema pogrešnih ni označenih pitanja.</p>}
      {items.map(({ it, no }) => (
        <PrintItem key={it.qid} it={it} no={no} image={images.get(it.qid)} />
      ))}
    </div>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Renders the report into a print-only container and opens the browser print dialog
 * ("Save as PDF"). Fully local: no popups, no network, works from file://.
 */
export async function printAttempt(a: Attempt, images: Map<string, string | undefined>): Promise<void> {
  document.getElementById('print-root')?.remove();
  const host = document.createElement('div');
  host.id = 'print-root';
  document.body.appendChild(host);
  render(<PrintReport a={a} images={images} />, host);

  // make sure exhibit images are decoded before the print preview is laid out
  await Promise.all(
    [...host.querySelectorAll('img')].map((img) => Promise.race([img.decode().catch(() => undefined), new Promise((r) => setTimeout(r, 3000))])),
  );

  const prevTitle = document.title;
  const d = new Date(a.finishedAt);
  document.title = `NSE4 ${a.name} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`.replace(/[\\/:*?"<>|]+/g, '-');
  document.body.classList.add('printing');
  const done = () => {
    window.removeEventListener('afterprint', done);
    document.body.classList.remove('printing');
    document.title = prevTitle;
    render(null, host);
    host.remove();
  };
  window.addEventListener('afterprint', done);
  window.print();
}
