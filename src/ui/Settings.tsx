import { useState } from 'preact/hooks';
import { exportBackup, history, meta, questions, restoreBackup, settings, wipeAll, exams, go } from '../store';
import { storageKind } from '../storage';
import { fmtDate } from '../core/util';
import { DEFAULT_SETTINGS, type Settings } from '../types';
import { askConfirm, toast } from './common';

export function SettingsPage() {
  const s = settings.value;
  const set = (patch: Partial<Settings>) => (settings.value = { ...settings.value, ...patch });
  const setRandom = (patch: Partial<Settings['random']>) => set({ random: { ...settings.value.random, ...patch } });
  const [err, setErr] = useState<string | null>(null);
  const num = (e: Event, min: number, max = 1e6) => Math.max(min, Math.min(max, Number((e.target as HTMLInputElement).value) || min));

  const onRestore = async (file: File | undefined) => {
    if (!file) return;
    setErr(null);
    const text = await file.text();
    askConfirm({
      title: 'Vratiti iz backupa?',
      danger: true,
      confirmLabel: 'Zameni sve podatke',
      body: <p>Svi trenutni podaci (pitanja, ispiti, istorija, postavke) biće <b>zamenjeni</b> sadržajem fajla „{file.name}“.</p>,
      onConfirm: () => {
        try {
          const r = restoreBackup(text);
          toast(r.dropped ? `Vraćeno (${r.dropped} nevažećih zapisa preskočeno)` : 'Backup vraćen');
        } catch (e) {
          setErr((e as Error).message);
        }
      },
    });
  };

  return (
    <div>
      <h1>Podešavanja</h1>

      <div class="card stack">
        <h2>Izgled</h2>
        <label class="field" style={{ maxWidth: '220px' }}><span>Tema</span>
          <select value={s.theme} onChange={(e) => set({ theme: (e.target as HTMLSelectElement).value as Settings['theme'] })}>
            <option value="auto">Automatski (sistem)</option>
            <option value="light">Svetla</option>
            <option value="dark">Tamna</option>
          </select>
        </label>
      </div>

      <div class="card stack">
        <h2>Nasumični ispit – podrazumevane vrednosti</h2>
        <p class="small muted">Proveri stvarne vrednosti na zvaničnoj stranici ispita i podesi ovde.</p>
        <div class="row">
          <label class="field"><span>Broj pitanja</span>
            <input type="number" min={1} value={s.random.count} onChange={(e) => setRandom({ count: num(e, 1) })} /></label>
          <label class="field"><span>Trajanje (min)</span>
            <input type="number" min={1} value={s.random.minutes} onChange={(e) => setRandom({ minutes: num(e, 1) })} /></label>
          <label class="field"><span>Prolaz (%)</span>
            <input type="number" min={0} max={100} value={s.random.passPercent} onChange={(e) => setRandom({ passPercent: num(e, 0, 100) })} /></label>
        </div>
      </div>

      <div class="card stack">
        <h2>Bodovanje i redosled</h2>
        <label class="check">
          <input type="checkbox" checked={s.partialCredit} onChange={(e) => set({ partialCredit: (e.target as HTMLInputElement).checked })} />
          Delimični bodovi za multi pitanja (podrazumevano isključeno)
        </label>
        <p class="small muted" style={{ margin: 0 }}>
          Isključeno: multi pitanje je tačno samo ako je izabran tačno ceo skup tačnih odgovora. Uključeno: bodovi = (pogođeni − promašeni) / broj tačnih, minimum 0.
          Važi za nove pokušaje.
        </p>
        <label class="check">
          <input type="checkbox" checked={s.shuffleQuestions} onChange={(e) => set({ shuffleQuestions: (e.target as HTMLInputElement).checked })} />
          Nasumičan redosled pitanja
        </label>
        <label class="check">
          <input type="checkbox" checked={s.shuffleOptions} onChange={(e) => set({ shuffleOptions: (e.target as HTMLInputElement).checked })} />
          Nasumičan redosled opcija (slova se uvek prikazuju A, B, C…)
        </label>
        <div><button class="btn sm" onClick={() => set({ ...DEFAULT_SETTINGS, theme: s.theme })}>Vrati podrazumevana podešavanja</button></div>
      </div>

      <div class="card stack">
        <h2>Backup</h2>
        <p class="small muted" style={{ margin: 0 }}>
          Podaci su sačuvani u ovom pregledaču ({storageKind.value}) i mogu nestati (čišćenje podataka, drugi pregledač/profil). Backup sadrži pitanja, ispite, istoriju i postavke.
        </p>
        <p style={{ margin: 0 }}>Poslednji backup: <b>{meta.value.lastBackupAt ? fmtDate(meta.value.lastBackupAt) : 'nikad'}</b></p>
        <div class="row">
          <button class="btn primary" onClick={() => { exportBackup(); toast('Backup preuzet'); }}>Preuzmi backup</button>
          <label class="btn" style={{ cursor: 'pointer' }}>
            Vrati iz backupa…
            <input type="file" accept=".json,application/json" class="sr"
              onChange={(e) => { const i = e.target as HTMLInputElement; void onRestore(i.files?.[0]).then(() => (i.value = '')); }} />
          </label>
        </div>
        {err && <div class="banner bad" role="alert">{err}</div>}
      </div>

      <div class="card stack">
        <h2>Opasna zona</h2>
        <p class="small muted" style={{ margin: 0 }}>Trenutno: {questions.value.length} pitanja, {exams.value.length} ispita, {history.value.length} pokušaja.</p>
        <div class="row">
          <button
            class="btn danger"
            onClick={() =>
              askConfirm({
                title: 'Obrisati istoriju?',
                danger: true,
                confirmLabel: 'Obriši istoriju',
                body: <p>Svi završeni pokušaji biće obrisani.</p>,
                onConfirm: () => { history.value = []; toast('Istorija obrisana'); },
              })
            }
          >
            Obriši istoriju
          </button>
          <button
            class="btn danger"
            onClick={() =>
              askConfirm({
                title: 'Obrisati SVE podatke?',
                danger: true,
                confirmLabel: 'Obriši sve',
                body: <p>Pitanja, ispiti, istorija i postavke biće trajno obrisani. Preporuka: prvo preuzmi backup.</p>,
                onConfirm: () => { wipeAll(); go({ name: 'home' }); toast('Sve obrisano'); },
              })
            }
          >
            Obriši sve
          </button>
        </div>
      </div>
    </div>
  );
}
