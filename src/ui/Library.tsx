import { useMemo, useState } from 'preact/hooks';
import { deletePack, deleteQuestion, exams, importFiles, questions } from '../store';
import type { ImportReport } from '../core/importer';
import type { Question } from '../types';
import { SOURCES } from '../types';
import { LETTERS, fmtDate } from '../core/util';
import { Exhibit, askConfirm, toast } from './common';
import { loadSample } from './Home';

interface FileResult {
  file: string;
  error?: string;
  report?: ImportReport;
}

const PAGE = 40;

export function Library() {
  return (
    <div>
      <h1>Biblioteka</h1>
      <ImportPanel />
      <Packs />
      <Browser />
    </div>
  );
}

function ImportPanel() {
  const [over, setOver] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const [busy, setBusy] = useState(false);

  const run = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    try {
      setResults(await importFiles(files, overwrite));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="card">
      <h2>Uvoz paketa</h2>
      <div
        class={'dropzone' + (over ? ' over' : '')}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void run([...(e.dataTransfer?.files ?? [])]);
        }}
      >
        <p>Prevuci JSON ili CSV datoteke ovdje, ili:</p>
        <div class="row" style={{ justifyContent: 'center' }}>
          <label class="btn primary" style={{ cursor: 'pointer' }}>
            {busy ? 'Uvozim…' : 'Odaberi datoteke'}
            <input
              type="file"
              accept=".json,.csv,.txt,application/json,text/csv"
              multiple
              class="sr"
              onChange={(e) => {
                const input = e.target as HTMLInputElement;
                void run([...(input.files ?? [])]).then(() => (input.value = ''));
              }}
            />
          </label>
          <button class="btn" onClick={loadSample}>Učitaj primjer paket</button>
        </div>
      </div>
      <label class="check" style={{ marginTop: '12px' }}>
        <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite((e.target as HTMLInputElement).checked)} />
        Prepiši pitanja/ispite koji već postoje (isti ID). Zadano: preskoči.
      </label>
      {results.map((r, i) => <Report key={i} r={r} />)}
    </div>
  );
}

function Report({ r }: { r: FileResult }) {
  if (r.error) {
    return <div class="banner bad" style={{ marginTop: '12px' }}><div><b>{r.file}</b>: {r.error}</div></div>;
  }
  const p = r.report!;
  const hasProblems = p.invalid.length > 0;
  return (
    <div class={'banner ' + (hasProblems ? 'warn' : 'good')} style={{ marginTop: '12px', display: 'block' }}>
      <div class="report">
        <b>{r.file}</b> → paket „{p.pack}“
        <ul>
          <li>Dodano pitanja: <b>{p.addedQuestions}</b> · preskočeno (postoje): <b>{p.skippedQuestions}</b>
            {p.overwrittenQuestions > 0 && <> · prepisano: <b>{p.overwrittenQuestions}</b></>}</li>
          {(p.addedExams + p.skippedExams + p.overwrittenExams > 0) && (
            <li>Ispiti – dodano: <b>{p.addedExams}</b> · preskočeno: <b>{p.skippedExams}</b>
              {p.overwrittenExams > 0 && <> · prepisano: <b>{p.overwrittenExams}</b></>}</li>
          )}
          <li>Nevažeći zapisi: <b>{p.invalid.length}</b></li>
        </ul>
        {p.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
        {hasProblems && (
          <details style={{ marginTop: '8px' }} open={p.invalid.length <= 8}>
            <summary>Prikaži nevažeće ({p.invalid.length})</summary>
            <ul>
              {p.invalid.slice(0, 300).map((x, i) => (
                <li key={i}><span class="mono">{x.ref}</span>: {x.reasons.join('; ')}</li>
              ))}
              {p.invalid.length > 300 && <li>… i još {p.invalid.length - 300}</li>}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

function Packs() {
  const qs = questions.value;
  const ex = exams.value;
  const packs = useMemo(() => {
    const m = new Map<string, { q: number; e: number; at: number }>();
    for (const q of qs) {
      const p = m.get(q.pack) ?? { q: 0, e: 0, at: q.addedAt };
      p.q++;
      p.at = Math.min(p.at, q.addedAt);
      m.set(q.pack, p);
    }
    for (const e of ex) {
      const p = m.get(e.pack) ?? { q: 0, e: 0, at: 0 };
      p.e++;
      m.set(e.pack, p);
    }
    return [...m.entries()];
  }, [qs, ex]);
  if (!packs.length) return null;
  return (
    <div class="card">
      <h2>Paketi</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Paket</th><th>Pitanja</th><th>Ispita</th><th>Dodano</th><th /></tr></thead>
          <tbody>
            {packs.map(([name, p]) => (
              <tr key={name}>
                <td>{name}</td><td>{p.q}</td><td>{p.e}</td><td class="nowrap">{p.at ? fmtDate(p.at) : '–'}</td>
                <td>
                  <button
                    class="btn sm danger"
                    onClick={() =>
                      askConfirm({
                        title: `Obrisati paket „${name}“?`,
                        danger: true,
                        confirmLabel: 'Obriši paket',
                        body: <p>Briše se {p.q} pitanja i {p.e} ispita. Historija pokušaja ostaje.</p>,
                        onConfirm: () => { deletePack(name); toast('Paket obrisan'); },
                      })
                    }
                  >
                    Obriši
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function count<T>(arr: T[], key: (x: T) => string | number): [string, number][] {
  const m = new Map<string, number>();
  for (const x of arr) m.set(String(key(x)), (m.get(String(key(x))) ?? 0) + 1);
  return [...m.entries()];
}

function Browser() {
  const qs = questions.value;
  const [search, setSearch] = useState('');
  const [src, setSrc] = useState<string>('');
  const [lesson, setLesson] = useState<string>('');
  const [topic, setTopic] = useState<string>('');
  const [page, setPage] = useState(0);

  const bySource = useMemo(() => count(qs, (q) => q.source), [qs]);
  const byLesson = useMemo(() => count(qs, (q) => q.lesson).sort((a, b) => +a[0] - +b[0]), [qs]);
  const byTopic = useMemo(() => count(qs, (q) => q.topic).sort((a, b) => a[0].localeCompare(b[0])), [qs]);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return qs.filter(
      (q) =>
        (!src || q.source === src) &&
        (!lesson || String(q.lesson) === lesson) &&
        (!topic || q.topic === topic) &&
        (!t || q.id.toLowerCase().includes(t) || q.topic.toLowerCase().includes(t) || q.question.toLowerCase().includes(t) ||
          q.options.some((o) => o.text.toLowerCase().includes(t))),
    );
  }, [qs, search, src, lesson, topic]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * PAGE, cur * PAGE + PAGE);
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0); };

  if (!qs.length) return null;

  return (
    <div class="card">
      <h2>Pitanja ({qs.length})</h2>
      <div class="row" style={{ marginBottom: '10px' }}>
        <span class="muted small">Izvor:</span>
        {SOURCES.map((s) => {
          const n = bySource.find(([k]) => k === s)?.[1] ?? 0;
          return (
            <button key={s} class="chip" aria-pressed={src === s} disabled={!n} onClick={() => reset(setSrc)(src === s ? '' : s)}>
              {s} <span class="n">{n}</span>
            </button>
          );
        })}
      </div>
      <div class="row" style={{ marginBottom: '10px' }}>
        <span class="muted small">Lekcija:</span>
        {byLesson.map(([l, n]) => (
          <button key={l} class="chip" aria-pressed={lesson === l} onClick={() => reset(setLesson)(lesson === l ? '' : l)}>
            {l} <span class="n">{n}</span>
          </button>
        ))}
      </div>
      <div class="row" style={{ marginBottom: '14px' }}>
        <input type="search" placeholder="Traži (ID, tekst, tema)…" value={search} style={{ maxWidth: '360px' }}
          onInput={(e) => reset(setSearch)((e.target as HTMLInputElement).value)} />
        <select value={topic} style={{ maxWidth: '320px' }} onChange={(e) => reset(setTopic)((e.target as HTMLSelectElement).value)}>
          <option value="">Sve teme ({byTopic.length})</option>
          {byTopic.map(([t, n]) => <option key={t} value={t}>{t} ({n})</option>)}
        </select>
        <span class="muted small">Prikazano: {filtered.length}</span>
      </div>

      {slice.map((q) => <QRow key={q.id} q={q} />)}
      {filtered.length === 0 && <p class="muted">Nema rezultata.</p>}

      {pages > 1 && (
        <div class="pager">
          <button class="btn sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>← Prethodna</button>
          <span class="small">Stranica {cur + 1} / {pages}</span>
          <button class="btn sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Sljedeća →</button>
        </div>
      )}
    </div>
  );
}

function QRow({ q }: { q: Question }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="qrow" style={{ flexWrap: 'wrap' }}>
      <span class="badge">{q.source}</span>
      <span class="badge">L{q.lesson}</span>
      <span class="mono small muted nowrap">{q.id}</span>
      <div class="q">
        <a href="#" style={{ color: 'inherit', textDecoration: 'none' }} onClick={(e) => { e.preventDefault(); setOpen(!open); }}>
          {open ? q.question : q.question.replace(/\s+/g, ' ').slice(0, 160) + (q.question.length > 160 ? '…' : '')}
        </a>
        <div class="small muted">{q.topic} · {q.type === 'multi' ? `multi (${q.correct.length})` : 'single'}{q.image ? ' · exhibit' : ''}</div>
        {open && (
          <div style={{ marginTop: '8px' }}>
            {q.image && <Exhibit src={q.image} />}
            <div class="opts">
              {q.options.map((o, i) => (
                <div key={o.id} class={'opt ' + (q.correct.includes(o.id) ? 'is-correct ' : '') + q.type} style={{ cursor: 'default' }}>
                  <span class="mark">{LETTERS[i]}</span><span class="txt">{o.text}</span>
                </div>
              ))}
            </div>
            {q.explanation && <p class="small" style={{ whiteSpace: 'pre-wrap' }}><b>Objašnjenje:</b> {q.explanation}</p>}
          </div>
        )}
      </div>
      <button
        class="btn sm ghost danger"
        aria-label={`Obriši ${q.id}`}
        onClick={() =>
          askConfirm({
            title: 'Obrisati pitanje?',
            danger: true,
            confirmLabel: 'Obriši',
            body: <p><span class="mono">{q.id}</span>: {q.question.slice(0, 200)}</p>,
            onConfirm: () => deleteQuestion(q.id),
          })
        }
      >
        ✕
      </button>
    </div>
  );
}
