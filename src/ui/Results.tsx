import { useMemo, useState } from 'preact/hooks';
import { go, history, questions, startRetryWrong } from '../store';
import type { Attempt, AttemptItem } from '../types';
import { breakdown, type GroupBy } from '../core/stats';
import { buildClaudeExport } from '../core/claudeExport';
import { idsToLetters } from '../core/scoring';
import { LETTERS, chooseLabel, fmtDate, fmtDuration, fmtPercent, fmtPts } from '../core/util';
import { Bars, Exhibit, Modal, Tabs, copyText, guardStart, toast } from './common';

export function Results({ attemptId }: { attemptId: string }) {
  const a = history.value.find((x) => x.id === attemptId);
  if (!a) {
    return (
      <div class="card empty">
        <p>Pokušaj nije pronađen.</p>
        <button class="btn primary" onClick={() => go({ name: 'history' })}>Istorija</button>
      </div>
    );
  }
  return <ResultsView a={a} />;
}

function ResultsView({ a }: { a: Attempt }) {
  const [by, setBy] = useState<GroupBy>('lesson');
  const [list, setList] = useState<'wrong' | 'flagged' | 'all'>('wrong');
  const [manual, setManual] = useState<string | null>(null);
  const imgs = useMemo(() => new Map(questions.value.map((q) => [q.id, q.image] as const)), []);

  const wrong = a.items.filter((i) => !i.isCorrect);
  const flagged = a.items.filter((i) => i.flagged);
  const shown = list === 'wrong' ? wrong : list === 'flagged' ? flagged : a.items;
  const buckets = breakdown(a.items, by);

  const copy = async () => {
    const text = buildClaudeExport(a);
    if (await copyText(text)) toast('Kopirano u clipboard – zalepi u chat');
    else setManual(text);
  };

  return (
    <div>
      <div class="row" style={{ marginBottom: '8px' }}>
        <h1 style={{ margin: 0 }}>{a.name}</h1>
        <span class={'badge ' + (a.mode === 'exam' ? 'accent' : 'good')}>{a.mode === 'exam' ? 'Ispit' : 'Vežba'}</span>
        <span class="muted small">{fmtDate(a.finishedAt)}</span>
      </div>

      <div class="card">
        <div class="score-hero">
          <div>
            <div class={'score-big ' + (a.passed ? 'pass' : 'fail')}>{fmtPercent(a.percent)}</div>
            <div class="muted">{fmtPts(a.points)} / {a.total} bodova</div>
          </div>
          <div>
            <span class={'badge ' + (a.passed ? 'good' : 'bad')} style={{ fontSize: '1rem', padding: '3px 14px' }}>
              {a.passed ? 'PROLAZ' : 'PAD'}
            </span>
            <div class="muted small" style={{ marginTop: '6px' }}>prag: {a.passPercent}%</div>
          </div>
          <div>
            <div><b>{fmtDuration(a.usedSec)}</b>{a.limitSec != null && <span class="muted"> / {fmtDuration(a.limitSec)}</span>}</div>
            <div class="muted small">utrošeno vreme{a.timedOut ? ' (isteklo vreme)' : ''}</div>
          </div>
          <div>
            <div><b>{a.items.filter((i) => i.isCorrect).length}</b> tačno · <b>{wrong.length}</b> netačno</div>
            <div class="muted small">{flagged.length} označeno{a.partialCredit ? ' · delimični bodovi' : ''}</div>
          </div>
        </div>
        <div class="row" style={{ marginTop: '16px' }}>
          <button class="btn primary" onClick={copy}>📋 Kopiraj za Claude</button>
          <button class="btn" disabled={!wrong.length} onClick={() => guardStart(() => startRetryWrong(a, 'practice'))}>Ponovi pogrešne (vežba)</button>
          <button class="btn" disabled={!wrong.length} onClick={() => guardStart(() => startRetryWrong(a, 'exam'))}>Ponovi pogrešne (ispit)</button>
          <button class="btn ghost right" onClick={() => go({ name: 'history' })}>Istorija</button>
          <button class="btn ghost" onClick={() => go({ name: 'home' })}>Početna</button>
        </div>
      </div>

      <div class="card">
        <h2>Rezultat po grupama</h2>
        <Tabs value={by} onChange={setBy} options={[['lesson', 'Lekcija'], ['topic', 'Tema'], ['source', 'Izvor']]} />
        <Bars
          passPercent={a.passPercent}
          data={buckets.map((b) => ({
            key: b.key,
            label: b.label,
            percent: b.percent,
            detail: `${fmtPts(b.correct)}/${b.total} · ${Math.round(b.percent)}%`,
          }))}
        />
        <p class="small muted" style={{ marginBottom: 0, marginTop: '10px' }}>Vertikalna crta = prag prolaza ({a.passPercent}%). Zelena = na pragu ili iznad, crvena = ispod.</p>
      </div>

      <div class="card">
        <h2>Pitanja</h2>
        <Tabs
          value={list}
          onChange={setList}
          options={[['wrong', `Pogrešna (${wrong.length})`], ['flagged', `Označena (${flagged.length})`], ['all', `Sva (${a.items.length})`]]}
        />
        {shown.length === 0 && <p class="muted">Nema pitanja za prikaz.</p>}
        {shown.map((it) => (
          <ResultItem key={it.qid} it={it} no={a.items.indexOf(it) + 1} image={imgs.get(it.qid)} />
        ))}
      </div>

      {manual != null && (
        <Modal title="Kopiraj ručno" wide onClose={() => setManual(null)}>
          <p class="small muted">Clipboard nije dostupan u ovom pregledaču. Označi tekst (Ctrl+A) i kopiraj (Ctrl+C).</p>
          <textarea readOnly rows={16} value={manual} onFocus={(e) => (e.target as HTMLTextAreaElement).select()} />
          <div class="modal-actions"><button class="btn" onClick={() => setManual(null)}>Zatvori</button></div>
        </Modal>
      )}
    </div>
  );
}

function ResultItem({ it, no, image }: { it: AttemptItem; no: number; image?: string }) {
  const text = new Map(it.options.map((o) => [o.id, o.text] as const));
  const mine = idsToLetters(it.order, it.selected);
  const right = idsToLetters(it.order, it.correct);
  return (
    <details class="ritem">
      <summary>
        <span class="mono muted">#{no}</span>
        <span class="q">{it.question.replace(/\s+/g, ' ')}</span>
        {it.flagged && <span class="badge warn">⚑</span>}
        <span class={'badge ' + (it.isCorrect ? 'good' : 'bad')}>{it.isCorrect ? 'tačno' : it.points > 0 ? `${Math.round(it.points * 100)}%` : 'netačno'}</span>
      </summary>
      <div class="body">
        <p class="small muted">Lekcija {it.lesson} · {it.topic} · izvor: {it.source} · <span class="mono">{it.qid}</span></p>
        <div class="qtext">{it.question}</div>
        {image && <Exhibit src={image} />}
        <div class="choose">{chooseLabel(it.correct.length)}</div>
        <div class="opts">
          {it.order.map((id, i) => {
            const sel = it.selected.includes(id);
            const ok = it.correct.includes(id);
            let cls = 'opt ' + (it.type === 'multi' ? 'multi' : 'single');
            let tag = '';
            if (ok && sel) { cls += ' is-correct'; tag = 'tvoj odgovor ✓'; }
            else if (ok) { cls += ' is-missed'; tag = 'tačan odgovor'; }
            else if (sel) { cls += ' is-wrong'; tag = 'tvoj odgovor ✗'; }
            return (
              <div key={id} class={cls} style={{ cursor: 'default' }}>
                <span class="mark">{LETTERS[i]}</span>
                <span class="txt">{text.get(id)}</span>
                {tag && <span class="tag">{tag}</span>}
              </div>
            );
          })}
        </div>
        <p style={{ marginTop: '10px', marginBottom: 0 }}>
          Tvoj odgovor: <b>{mine.length ? mine.join(', ') : '(bez odgovora)'}</b> · Tačan odgovor: <b>{right.join(', ')}</b>
        </p>
        {it.explanation && <div class="feedback ok" style={{ background: 'var(--surface-2)', color: 'var(--text)' }}><div class="expl" style={{ marginTop: 0 }}>{it.explanation}</div></div>}
      </div>
    </details>
  );
}
