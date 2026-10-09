import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  abandonSession, checkAnswer, flushPending, go, questions, session, setElapsed, setIndex, submitSession,
  toggleFlag, toggleOption,
} from '../store';
import type { Question, Session, SessionItem } from '../types';
import { LETTERS, chooseLabel, fmtDuration } from '../core/util';
import { idsToLetters, scoreAnswer } from '../core/scoring';
import { Exhibit, askConfirm, modalOpen } from './common';

function Timer({ s }: { s: Session }) {
  const base = useRef(s.elapsedSec);
  const t0 = useRef(Date.now());
  const [, force] = useState(0);
  const done = useRef(false);
  const elapsed = () => base.current + (Date.now() - t0.current) / 1000;

  useEffect(() => {
    const id = window.setInterval(() => {
      const e = elapsed();
      force((n) => n + 1);
      if (s.limitSec != null && e >= s.limitSec && !done.current) {
        done.current = true;
        setElapsed(s.limitSec);
        submitSession(true);
        return;
      }
      if (Math.floor(e) % 5 === 0) setElapsed(Math.floor(e));
    }, 1000);
    const onHide = () => {
      setElapsed(Math.floor(elapsed()));
      flushPending();
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      clearInterval(id);
      window.removeEventListener('pagehide', onHide);
      if (!done.current) setElapsed(Math.floor(elapsed())); // leaving the screen pauses the clock
    };
  }, []);

  const e = elapsed();
  if (s.limitSec == null) return <span class="timer" title="Proteklo vreme">{fmtDuration(e)}</span>;
  const left = Math.max(0, s.limitSec - e);
  return (
    <span class={'timer' + (left < 300 ? ' low' : '')} title="Preostalo vreme" aria-label={`Preostalo vreme ${fmtDuration(left)}`}>
      {fmtDuration(left)}
    </span>
  );
}

function isAnswered(it: SessionItem): boolean {
  return it.selected.length > 0;
}

export function Runner() {
  const s = session.value;
  const qs = questions.value;
  const qmap = useMemo(() => new Map(qs.map((q) => [q.id, q] as const)), [qs]);
  const [review, setReview] = useState(false);
  const [showNav, setShowNav] = useState(() => window.innerWidth > 860);

  // keyboard shortcuts - always use latest state through a ref
  const latest = useRef({ s, qmap, review });
  latest.current = { s, qmap, review };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { s, qmap, review } = latest.current;
      if (!s || modalOpen.value > 0) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      if (review) return;
      const idx = s.index;
      const it = s.items[idx];
      const q = it && qmap.get(it.qid);
      if (key === 'N' || key === 'ArrowRight') {
        e.preventDefault();
        setIndex(idx + 1);
      } else if (key === 'P' || key === 'ArrowLeft') {
        e.preventDefault();
        setIndex(idx - 1);
      } else if (key === 'Enter' && s.mode === 'practice' && it && !it.checked) {
        e.preventDefault();
        checkAnswer(idx);
      } else if (q && it && /^[A-H]$/.test(key)) {
        const li = LETTERS.indexOf(key);
        // F is "flag" unless the question really has an option F (then Shift+F flags)
        if (key === 'F' && (li >= it.order.length || e.shiftKey)) {
          e.preventDefault();
          toggleFlag(idx);
        } else if (li < it.order.length) {
          e.preventDefault();
          toggleOption(idx, it.order[li], q.type === 'multi');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!s) {
    return (
      <div class="card empty">
        <p>Nema aktivnog ispita.</p>
        <button class="btn primary" onClick={() => go({ name: 'home' })}>Početna</button>
      </div>
    );
  }

  const answered = s.items.filter(isAnswered).length;
  const flagged = s.items.filter((i) => i.flagged).length;

  const doSubmit = () => {
    const unanswered = s.items.length - answered;
    askConfirm({
      title: 'Predaj ispit?',
      confirmLabel: 'Predaj',
      body: (
        <p>
          Odgovoreno {answered}/{s.items.length}.{' '}
          {unanswered > 0 ? <b>{unanswered} pitanja je bez odgovora (računaju se kao netačna).</b> : 'Sva pitanja su odgovorena.'}
          {flagged > 0 && <> Označeno za pregled: {flagged}.</>}
        </p>
      ),
      onConfirm: () => submitSession(false),
    });
  };

  const exit = () => go({ name: 'home' });
  const abandon = () =>
    askConfirm({
      title: 'Prekinuti ispit?',
      danger: true,
      confirmLabel: 'Prekini i odbaci',
      body: <p>Odgovori neće biti sačuvani u istoriji.</p>,
      onConfirm: abandonSession,
    });

  const header = (
    <div class="run-head">
      <div>
        <b>{s.name}</b>{' '}
        <span class={'badge ' + (s.mode === 'exam' ? 'accent' : 'good')}>{s.mode === 'exam' ? 'Ispit' : 'Vežba'}</span>
      </div>
      <div class="muted small">{answered}/{s.items.length} odgovoreno{flagged ? ` · ${flagged} označeno` : ''}</div>
      <div class="right row">
        <Timer s={s} />
        {!review && <button class="btn sm" onClick={() => setReview(true)}>Pregled</button>}
        <button class="btn sm primary" onClick={doSubmit}>Predaj</button>
        <button class="btn sm ghost" onClick={exit} title="Izađi, ispit ostaje sačuvan (sat se pauzira)">Izađi</button>
        <button class="btn sm ghost danger" onClick={abandon}>Prekini</button>
      </div>
    </div>
  );

  if (review) {
    return (
      <div>
        {header}
        <Review s={s} qmap={qmap} onBack={() => setReview(false)} onJump={(i) => { setIndex(i); setReview(false); }} onSubmit={doSubmit} />
      </div>
    );
  }

  const it = s.items[s.index];
  const q = qmap.get(it.qid);

  return (
    <div>
      {header}
      <div class="run-layout">
        <div class="card">
          {q ? (
            <QuestionCard s={s} it={it} q={q} idx={s.index} />
          ) : (
            <p>Ovo pitanje je obrisano iz biblioteke.</p>
          )}
          <div class="qnav">
            <button class="btn" disabled={s.index === 0} onClick={() => setIndex(s.index - 1)}>← Prethodno <span class="kbd">P</span></button>
            <button class="btn" disabled={s.index >= s.items.length - 1} onClick={() => setIndex(s.index + 1)}>Sledeće → <span class="kbd">N</span></button>
            <button class={'btn' + (it.flagged ? ' primary' : '')} onClick={() => toggleFlag(s.index)} aria-pressed={it.flagged}>
              ⚑ {it.flagged ? 'Označeno' : 'Označi'} <span class="kbd">F</span>
            </button>
            {s.mode === 'practice' && !it.checked && (
              <button class="btn primary" disabled={!it.selected.length} onClick={() => checkAnswer(s.index)}>Proveri <span class="kbd">Enter</span></button>
            )}
            {s.index === s.items.length - 1 && <button class="btn primary right" onClick={() => setReview(true)}>Pregled i predaja</button>}
          </div>
          <p class="small muted" style={{ marginTop: '14px', marginBottom: 0 }}>
            Tasteri: <span class="kbd">A</span>–<span class="kbd">H</span> izbor · <span class="kbd">N</span>/<span class="kbd">P</span> sledeće/prethodno · <span class="kbd">F</span> oznaka
            (ako pitanje ima opciju F: <span class="kbd">Shift+F</span>)
          </p>
        </div>
        <aside class="card side" aria-label="Navigator">
          <div class="row">
            <h3 style={{ margin: 0 }}>Navigator</h3>
            <button class="btn sm ghost right" onClick={() => setShowNav(!showNav)}>{showNav ? 'Sakrij' : 'Prikaži'}</button>
          </div>
          {showNav && (
            <>
              <div class="navgrid" style={{ marginTop: '10px' }}>
                {s.items.map((x, i) => {
                  const qq = qmap.get(x.qid);
                  let cls = 'navcell';
                  if (isAnswered(x)) cls += ' answered';
                  if (s.mode === 'practice' && x.checked && qq) cls += scoreAnswer(qq.correct, x.selected, false).isCorrect ? ' ok' : ' ko';
                  if (x.flagged) cls += ' flagged';
                  if (i === s.index) cls += ' current';
                  return (
                    <button key={i} class={cls} onClick={() => setIndex(i)} aria-label={`Pitanje ${i + 1}${isAnswered(x) ? ', odgovoreno' : ''}${x.flagged ? ', označeno' : ''}`}>
                      {i + 1}
                    </button>
                  );
                })}
              </div>
              <div class="legend">
                <span><i style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent)' }} />odgovoreno</span>
                <span><i />neodgovoreno</span>
                <span><i style={{ background: 'var(--warn)' }} />označeno</span>
                {s.mode === 'practice' && <span><i style={{ background: 'var(--good-soft)', borderColor: 'var(--good)' }} />tačno</span>}
                {s.mode === 'practice' && <span><i style={{ background: 'var(--bad-soft)', borderColor: 'var(--bad)' }} />netačno</span>}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function QuestionCard({ s, it, q, idx }: { s: Session; it: SessionItem; q: Question; idx: number }) {
  const feedback = s.mode === 'practice' && it.checked;
  const sc = feedback ? scoreAnswer(q.correct, it.selected, false) : null;
  const optText = new Map(q.options.map((o) => [o.id, o.text] as const));
  const multi = q.type === 'multi';
  return (
    <div>
      <div class="qhead">
        <b>Pitanje {idx + 1} / {s.items.length}</b>
        {s.mode === 'practice' && (
          <>
            <span class="badge">Lekcija {q.lesson}</span>
            <span class="badge">{q.topic}</span>
          </>
        )}
        {it.flagged && <span class="badge warn">⚑ označeno</span>}
      </div>
      <div class="qtext">{q.question}</div>
      {q.image && <Exhibit src={q.image} />}
      <div class="choose">{chooseLabel(q.correct.length)}</div>
      <div class="opts" role={multi ? 'group' : 'radiogroup'} aria-label="Opcije">
        {it.order.map((id, i) => {
          const sel = it.selected.includes(id);
          const correct = q.correct.includes(id);
          let cls = 'opt ' + (multi ? 'multi' : 'single');
          let tag = '';
          if (feedback) {
            if (correct && sel) { cls += ' is-correct'; tag = 'tačno'; }
            else if (correct) { cls += ' is-missed'; tag = 'tačan odgovor'; }
            else if (sel) { cls += ' is-wrong'; tag = 'netačno'; }
          }
          return (
            <button
              key={id}
              class={cls}
              role={multi ? 'checkbox' : 'radio'}
              aria-checked={sel}
              disabled={feedback}
              onClick={() => toggleOption(idx, id, multi)}
            >
              <span class="mark">{LETTERS[i]}</span>
              <span class="txt">{optText.get(id)}</span>
              {tag && <span class="tag">{tag}</span>}
            </button>
          );
        })}
      </div>
      {feedback && sc && (
        <div class={'feedback ' + (sc.isCorrect ? 'ok' : 'ko')} role="status">
          <b>{sc.isCorrect ? 'Tačno' : 'Netačno'}</b> – tačan odgovor: <b>{idsToLetters(it.order, q.correct).join(', ')}</b>
          {q.explanation && <div class="expl">{q.explanation}</div>}
          {!q.explanation && <div class="expl muted">Nema objašnjenja za ovo pitanje.</div>}
        </div>
      )}
    </div>
  );
}

function Review(props: {
  s: Session;
  qmap: Map<string, Question>;
  onBack: () => void;
  onJump: (i: number) => void;
  onSubmit: () => void;
}) {
  const { s, qmap } = props;
  const [filter, setFilter] = useState<'all' | 'unanswered' | 'flagged'>('all');
  const answered = s.items.filter(isAnswered).length;
  const flagged = s.items.filter((i) => i.flagged).length;
  const rows = s.items
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => (filter === 'unanswered' ? !isAnswered(it) : filter === 'flagged' ? it.flagged : true));
  return (
    <div class="card" style={{ marginTop: '16px' }}>
      <h2>Pregled pre predaje</h2>
      <div class="stat-strip" style={{ marginBottom: '12px' }}>
        <div class="stat"><b>{answered}</b><span>odgovoreno</span></div>
        <div class="stat"><b>{s.items.length - answered}</b><span>neodgovoreno</span></div>
        <div class="stat"><b>{flagged}</b><span>označeno</span></div>
      </div>
      <div class="tabs">
        {([['all', 'Sva'], ['unanswered', 'Neodgovorena'], ['flagged', 'Označena']] as const).map(([v, l]) => (
          <button key={v} class="tab" aria-selected={filter === v} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>
      <div>
        {rows.length === 0 && <p class="muted">Nema pitanja u ovom filteru.</p>}
        {rows.map(({ it, i }) => {
          const q = qmap.get(it.qid);
          return (
            <div class="review-row" key={i} onClick={() => props.onJump(i)} role="button" tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && props.onJump(i)}>
              <span class="no">{i + 1}</span>
              <span class="q">{q ? q.question.replace(/\s+/g, ' ') : '(obrisano pitanje)'}</span>
              {it.flagged && <span class="badge warn">⚑</span>}
              {isAnswered(it) ? <span class="badge accent">odgovoreno</span> : <span class="badge">prazno</span>}
            </div>
          );
        })}
      </div>
      <div class="row" style={{ marginTop: '16px' }}>
        <button class="btn" onClick={props.onBack}>← Nazad na pitanja</button>
        <button class="btn primary right" onClick={props.onSubmit}>Predaj ispit</button>
      </div>
    </div>
  );
}
