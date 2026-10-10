import { useState } from 'preact/hooks';
import { deleteAttempt, exportHistory, go, history, importHistory, settings } from '../store';
import type { Attempt } from '../types';
import { weakAreas } from '../core/stats';
import { fmtDate, fmtDuration, fmtPercent, fmtPts } from '../core/util';
import { Bars, Sparkline, Tabs, askConfirm, toast } from './common';

export function History() {
  const [tab, setTab] = useState<'attempts' | 'weak'>('attempts');
  const [by, setBy] = useState<'topic' | 'lesson'>('topic');
  const [examKey, setExamKey] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const hist = history.value;

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    setErr(null);
    try {
      const r = importHistory(await file.text());
      toast(
        `Uvezeno ${r.added} pokušaja` +
          (r.skipped ? `, ${r.skipped} već postoji` : '') +
          (r.dropped ? `, ${r.dropped} nevažećih preskočeno` : ''),
      );
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const keyOf = (a: Attempt) => a.examId ?? `${a.kind}:${a.kind === 'fixed' ? a.name : ''}`;
  const groups = [...new Map(hist.map((a) => [keyOf(a), a.examId ? a.name : { random: 'Nasumični ispiti', custom: 'Prilagođeni ispiti', retry: 'Ponavljanje pogrešnih', fixed: a.name }[a.kind]] as const)).entries()];
  const sorted = hist.filter((a) => !examKey || keyOf(a) === examKey).sort((a, b) => b.finishedAt - a.finishedAt);
  const best = sorted.reduce((m, a) => Math.max(m, a.percent), -1);

  return (
    <div>
      <div class="row" style={{ marginBottom: '8px' }}>
        <h1 style={{ margin: 0 }}>Istorija</h1>
        <div class="right row">
          <button class="btn sm" disabled={!hist.length} onClick={() => { exportHistory(); toast('Istorija preuzeta'); }}>Izvezi istoriju (JSON)</button>
          <label class="btn sm" style={{ cursor: 'pointer' }}>
            Uvezi istoriju…
            <input type="file" accept=".json,application/json" class="sr"
              onChange={(e) => { const i = e.target as HTMLInputElement; void onImport(i.files?.[0]).then(() => (i.value = '')); }} />
          </label>
        </div>
      </div>
      {err && <div class="banner bad" role="alert">{err}</div>}
      <Tabs value={tab} onChange={setTab} options={[['attempts', `Pokušaji (${hist.length})`], ['weak', 'Slaba područja']]} />
      {hist.length === 0 && <div class="card empty">Još nema završenih pokušaja. Ako si ranije izvezao istoriju, uvezi je dugmetom iznad.</div>}

      {tab === 'attempts' && hist.length > 0 && (
        <div class="card table-wrap">
          <div class="row" style={{ marginBottom: '10px' }}>
            <select value={examKey} style={{ maxWidth: '320px' }} onChange={(e) => setExamKey((e.target as HTMLSelectElement).value)}>
              <option value="">Svi ispiti</option>
              {groups.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <span class="muted small">{sorted.length} pokušaja · najbolji rezultat: <b>{fmtPercent(best)}</b></span>
          </div>
          <table>
            <thead>
              <tr><th>Datum</th><th>Ispit</th><th>Mod</th><th>Rezultat</th><th>Status</th><th>Vreme</th><th /></tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.id}>
                  <td class="nowrap">{fmtDate(a.finishedAt)}</td>
                  <td>{a.name}</td>
                  <td>{a.mode === 'exam' ? 'Ispit' : 'Vežba'}</td>
                  <td class="nowrap">{fmtPts(a.points)}/{a.total} · <b>{fmtPercent(a.percent)}</b></td>
                  <td><span class={'badge ' + (a.passed ? 'good' : 'bad')}>{a.passed ? 'prolaz' : 'pad'}</span></td>
                  <td class="nowrap">{fmtDuration(a.usedSec)}</td>
                  <td class="nowrap">
                    <button class="btn sm" onClick={() => go({ name: 'results', attemptId: a.id })}>Otvori</button>{' '}
                    <button
                      class="btn sm ghost danger"
                      aria-label="Obriši pokušaj"
                      onClick={() =>
                        askConfirm({
                          title: 'Obrisati pokušaj?',
                          danger: true,
                          confirmLabel: 'Obriši',
                          body: <p>{a.name} – {fmtDate(a.finishedAt)}. Ovo utiče na statistiku slabih područja.</p>,
                          onConfirm: () => deleteAttempt(a.id),
                        })
                      }
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'weak' && hist.length > 0 && <Weak by={by} setBy={setBy} />}
    </div>
  );
}

function Weak({ by, setBy }: { by: 'topic' | 'lesson'; setBy: (v: 'topic' | 'lesson') => void }) {
  const data = weakAreas(history.value, by);
  const passMark = settings.value.random.passPercent;
  return (
    <div class="card">
      <div class="row">
        <h2 style={{ margin: 0 }}>Tačnost po {by === 'topic' ? 'temama' : 'lekcijama'}</h2>
        <div class="right"><Tabs value={by} onChange={setBy} options={[['topic', 'Teme'], ['lesson', 'Lekcije']]} /></div>
      </div>
      <p class="small muted">Sortirano od najslabijeg. Mini grafikon = tačnost po pokušajima (stariji → noviji, poslednjih 12).</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>{by === 'topic' ? 'Tema' : 'Lekcija'}</th><th style={{ width: '40%' }}>Tačnost</th><th>Odgovoreno</th><th>Trend</th></tr></thead>
          <tbody>
            {data.map((w) => (
              <tr key={w.key}>
                <td>{w.label}</td>
                <td>
                  <Bars
                    data={[{ key: w.key, label: '', percent: w.percent, detail: fmtPercent(w.percent) }]}
                    passPercent={passMark}
                    noLabels
                  />
                </td>
                <td class="nowrap">{w.answered}</td>
                <td><Sparkline values={w.trend} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="small muted" style={{ marginBottom: 0 }}>Crvena traka = ispod praga prolaza ({passMark} %).</p>
    </div>
  );
}
