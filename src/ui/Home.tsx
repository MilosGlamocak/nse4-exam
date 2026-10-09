import { useState } from 'preact/hooks';
import { exams, go, history, importText, questions, session, startFixed, startRandom, settings } from '../store';
import { fmtPercent } from '../core/util';
import { guardStart, toast } from './common';
import samplePack from '../../sample-pack.json?raw';

export function loadSample(): void {
  const r = importText(samplePack, 'sample-pack.json', false);
  if (r.error) toast('Greška: ' + r.error);
  else toast(`Probni paket učitan: ${r.report!.addedQuestions} pitanja, ${r.report!.addedExams} ispit`);
}

export function Home() {
  const qs = questions.value;
  const ex = exams.value;
  const hist = history.value;
  const s = session.value;
  const st = settings.value;
  const [cnt, setCnt] = useState(st.random.count);
  const [min, setMin] = useState(st.random.minutes);
  const [pass, setPass] = useState(st.random.passPercent);
  const have = new Set(qs.map((q) => q.id));

  return (
    <div>
      <h1>Početna</h1>

      {s && (
        <div class="banner info" role="status">
          <span>
            Ispit u toku: <b>{s.name}</b> ({s.items.filter((i) => i.selected.length).length}/{s.items.length} odgovoreno).
          </span>
          <button class="btn primary sm" onClick={() => go({ name: 'run' })}>Nastavi</button>
        </div>
      )}

      <div class="stat-strip">
        <div class="stat"><b>{qs.length}</b><span>pitanja</span></div>
        <div class="stat"><b>{ex.length}</b><span>fiksnih ispita</span></div>
        <div class="stat"><b>{hist.length}</b><span>pokušaja</span></div>
      </div>

      {qs.length === 0 && (
        <div class="card empty" style={{ marginTop: '16px' }}>
          <h2>Biblioteka je prazna</h2>
          <p>Uvezi paket pitanja (JSON ili CSV) ili učitaj mali primer da isprobaš sve funkcije.</p>
          <div class="row" style={{ justifyContent: 'center' }}>
            <button class="btn primary" onClick={() => go({ name: 'library' })}>Uvezi paket</button>
            <button class="btn" onClick={loadSample}>Učitaj probni paket</button>
          </div>
        </div>
      )}

      <div class="section-title"><h2>Fiksni ispiti</h2><span class="muted small">definisani u paketima</span></div>
      {ex.length === 0 ? (
        <p class="muted">Nema fiksnih ispita. Paket može sadržavati ključ <span class="mono">exams</span>.</p>
      ) : (
        <div class="grid cols-2">
          {ex.map((e) => {
            const avail = e.questionIds.filter((id) => have.has(id)).length;
            const att = hist.filter((a) => a.examId === e.id);
            const best = att.reduce((m, a) => Math.max(m, a.percent), -1);
            const last = att[att.length - 1];
            return (
              <div class="card exam-card" key={e.id}>
                <h3>{e.name}</h3>
                <div class="exam-meta">
                  {avail === e.questionIds.length ? `${avail} pitanja` : `${avail}/${e.questionIds.length} pitanja dostupno`} · {e.durationMinutes} min · prolaz {e.passPercent}%
                </div>
                {att.length > 0 ? (
                  <p class="small">
                    Najbolji: <b>{fmtPercent(best)}</b> {best >= e.passPercent ? <span class="badge good">prolaz</span> : <span class="badge bad">pad</span>}
                    {' · '}pokušaja: {att.length}
                    {last && <> · poslednji: {fmtPercent(last.percent)}</>}
                  </p>
                ) : (
                  <p class="small muted">Još nema pokušaja.</p>
                )}
                {avail < e.questionIds.length && (
                  <p class="small" style={{ color: 'var(--warn)' }}>Nedostaju pitanja – uvezi preostale pakete.</p>
                )}
                <div class="row">
                  <button class="btn primary" disabled={avail === 0} onClick={() => guardStart(() => startFixed(e, 'exam'))}>Ispit</button>
                  <button class="btn" disabled={avail === 0} onClick={() => guardStart(() => startFixed(e, 'practice'))}>Vežba</button>
                  {att.length > 0 && <button class="btn ghost" onClick={() => go({ name: 'history' })}>Istorija</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div class="section-title"><h2>Nasumični ispit</h2><span class="muted small">pitanja iz cele biblioteke</span></div>
      <div class="card">
        <div class="row" style={{ alignItems: 'flex-end' }}>
          <label class="field"><span>Broj pitanja</span>
            <input type="number" min={1} max={Math.max(1, qs.length)} value={cnt} onInput={(e) => setCnt(+(e.target as HTMLInputElement).value)} />
          </label>
          <label class="field"><span>Trajanje (min)</span>
            <input type="number" min={1} value={min} onInput={(e) => setMin(+(e.target as HTMLInputElement).value)} />
          </label>
          <label class="field"><span>Prolaz (%)</span>
            <input type="number" min={0} max={100} value={pass} onInput={(e) => setPass(+(e.target as HTMLInputElement).value)} />
          </label>
          <button class="btn primary" disabled={!qs.length || cnt < 1} onClick={() => guardStart(() => startRandom('exam', Math.min(cnt, qs.length), min, pass))}>Ispit</button>
          <button class="btn" disabled={!qs.length || cnt < 1} onClick={() => guardStart(() => startRandom('practice', Math.min(cnt, qs.length), min, pass))}>Vežba</button>
        </div>
        <p class="small muted" style={{ marginTop: '10px', marginBottom: 0 }}>
          Podrazumevane vrednosti menjaš u Podešavanjima. {qs.length > 0 && cnt > qs.length && `U biblioteci ima samo ${qs.length} pitanja.`}
        </p>
      </div>

      <div class="section-title"><h2>Prilagođeni ispit</h2></div>
      <div class="card row">
        <span class="grow">Filtriraj po lekciji, temi, izvoru, pogrešnim / označenim / neviđenim pitanjima.</span>
        <button class="btn primary" disabled={!qs.length} onClick={() => go({ name: 'custom' })}>Podesi ispit</button>
      </div>
    </div>
  );
}
