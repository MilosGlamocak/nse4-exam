import { useMemo, useState } from 'preact/hooks';
import { go, history, questions, settings, startSession } from '../store';
import { filterQuestions, questionStats, type StatusFilter } from '../core/stats';
import { pickRandom } from '../core/session';
import { SOURCES, type Mode } from '../types';
import { guardStart } from './common';

function toggle<T>(set: Set<T>, v: T): Set<T> {
  const n = new Set(set);
  n.has(v) ? n.delete(v) : n.add(v);
  return n;
}

export function Custom() {
  const qs = questions.value;
  const st = settings.value;
  const stats = useMemo(() => questionStats(history.value), [history.value]);
  const [lessons, setLessons] = useState<Set<number>>(new Set());
  const [topics, setTopics] = useState<Set<string>>(new Set());
  const [sources, setSources] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<StatusFilter>('all');
  const [topicQ, setTopicQ] = useState('');
  const [count, setCount] = useState(st.random.count);
  const [timer, setTimer] = useState(true);
  const [minutes, setMinutes] = useState(st.random.minutes);
  const [mode, setMode] = useState<Mode>('exam');
  const [pass, setPass] = useState(st.random.passPercent);

  const lessonCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const q of qs) m.set(q.lesson, (m.get(q.lesson) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [qs]);
  const topicCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of qs) if (!lessons.size || lessons.has(q.lesson)) m.set(q.topic, (m.get(q.topic) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [qs, lessons]);

  const matched = useMemo(
    () => filterQuestions(qs, stats, { lessons, topics, sources, status }),
    [qs, stats, lessons, topics, sources, status],
  );
  const n = Math.max(0, Math.min(count, matched.length));
  const vis = topicCounts.filter(([t]) => t.toLowerCase().includes(topicQ.trim().toLowerCase()));

  const start = () => {
    const pool = pickRandom(matched, n);
    startSession({
      kind: 'custom',
      name: `Prilagođeni ispit (${pool.length})`,
      mode,
      pool,
      limitSec: timer ? Math.round(minutes * 60) : null,
      passPercent: pass,
    });
  };

  return (
    <div>
      <h1>Prilagođeni ispit</h1>
      <div class="card stack">
        <div>
          <h3>Lekcije</h3>
          <div class="row">
            {lessonCounts.map(([l, c]) => (
              <button key={l} class="chip" aria-pressed={lessons.has(l)} onClick={() => setLessons(toggle(lessons, l))}>
                {l} <span class="n">{c}</span>
              </button>
            ))}
            {lessons.size > 0 && <button class="btn sm ghost" onClick={() => setLessons(new Set())}>poništi</button>}
          </div>
        </div>
        <div>
          <h3>Izvor</h3>
          <div class="row">
            {SOURCES.map((s) => (
              <button key={s} class="chip" aria-pressed={sources.has(s)} onClick={() => setSources(toggle(sources, s))}>{s}</button>
            ))}
          </div>
        </div>
        <div>
          <h3>Teme {topics.size > 0 && <span class="muted small">({topics.size} izabrano)</span>}</h3>
          <input type="search" placeholder="Traži temu…" value={topicQ} onInput={(e) => setTopicQ((e.target as HTMLInputElement).value)} style={{ maxWidth: '320px', marginBottom: '8px' }} />
          <div class="scroll-list">
            {vis.map(([t, c]) => (
              <label class="check" key={t} style={{ display: 'flex', padding: '3px 0' }}>
                <input type="checkbox" checked={topics.has(t)} onChange={() => setTopics(toggle(topics, t))} />
                <span>{t} <span class="muted">({c})</span></span>
              </label>
            ))}
            {vis.length === 0 && <span class="muted">Nema tema.</span>}
          </div>
          {topics.size > 0 && <button class="btn sm ghost" onClick={() => setTopics(new Set())}>poništi teme</button>}
        </div>
        <div>
          <h3>Status pitanja</h3>
          <div class="row">
            {([['all', 'Sva'], ['wrong', 'Samo prethodno pogrešna'], ['flagged', 'Samo označena'], ['unseen', 'Samo nikad viđena']] as const).map(([v, l]) => (
              <label class="check" key={v}>
                <input type="radio" name="status" checked={status === v} onChange={() => setStatus(v)} /> {l}
              </label>
            ))}
          </div>
          <p class="small muted" style={{ marginBottom: 0 }}>„Pogrešna“ i „označena“ se odnose na poslednji put kada je pitanje bilo u nekom pokušaju.</p>
        </div>
      </div>

      <div class="card" style={{ marginTop: '16px' }}>
        <h3>Podešavanja ispita</h3>
        <div class="row" style={{ alignItems: 'flex-end' }}>
          <label class="field"><span>Broj pitanja (max {matched.length})</span>
            <input type="number" min={1} value={count} onInput={(e) => setCount(+(e.target as HTMLInputElement).value)} />
          </label>
          <label class="field"><span>Mod</span>
            <select value={mode} onChange={(e) => setMode((e.target as HTMLSelectElement).value as Mode)} style={{ width: '170px' }}>
              <option value="exam">Ispit (bez feedbacka)</option>
              <option value="practice">Vežba (odmah feedback)</option>
            </select>
          </label>
          <label class="check" style={{ marginBottom: '8px' }}>
            <input type="checkbox" checked={timer} onChange={(e) => setTimer((e.target as HTMLInputElement).checked)} /> Tajmer
          </label>
          <label class="field"><span>Trajanje (min)</span>
            <input type="number" min={1} disabled={!timer} value={minutes} onInput={(e) => setMinutes(+(e.target as HTMLInputElement).value)} />
          </label>
          <label class="field"><span>Prolaz (%)</span>
            <input type="number" min={0} max={100} value={pass} onInput={(e) => setPass(+(e.target as HTMLInputElement).value)} />
          </label>
        </div>
        <div class="row" style={{ marginTop: '16px' }}>
          <span><b>{matched.length}</b> pitanja odgovara filterima → ispit će imati <b>{n}</b>.</span>
          <button class="btn primary right" disabled={n < 1} onClick={() => guardStart(start)}>Započni</button>
          <button class="btn" onClick={() => go({ name: 'home' })}>Nazad</button>
        </div>
      </div>
    </div>
  );
}
