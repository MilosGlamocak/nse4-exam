import { useEffect } from 'preact/hooks';
import { backupDue } from './core/backup';
import { bundledNotice, go, meta, questions, history, ready, route, settings, exportBackup, snoozeBackupBanner } from './store';
import { storageError, storageKind } from './storage';
import { ConfirmHost, ToastHost, toast } from './ui/common';
import { Home } from './ui/Home';
import { Library } from './ui/Library';
import { Runner } from './ui/Runner';
import { Results } from './ui/Results';
import { History } from './ui/History';
import { SettingsPage } from './ui/Settings';
import { Custom } from './ui/Custom';

const NAV: [string, string, string][] = [
  ['home', 'Početna', 'home'],
  ['library', 'Biblioteka', 'library'],
  ['history', 'Istorija', 'history'],
  ['settings', 'Podešavanja', 'settings'],
];

export function App() {
  const th = settings.value.theme;
  useEffect(() => {
    const el = document.documentElement;
    if (th === 'auto') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', th);
  }, [th]);

  if (!ready.value) return <main><p class="muted">Učitavanje…</p></main>;

  const r = route.value;
  const inRun = r.name === 'run';
  const due = backupDue(meta.value, questions.value.length + history.value.length > 0);
  const lastBk = meta.value.lastBackupAt;

  return (
    <>
      <header class="topbar">
        <div class="topbar-in">
          <div class="brand"><span class="brand-logo">NSE4</span> Exam Simulator</div>
          <nav class="nav" aria-label="Glavna navigacija">
            {NAV.map(([name, label]) => (
              <button
                key={name}
                aria-current={r.name === name || (name === 'home' && (r.name === 'custom' || r.name === 'run')) ? 'page' : undefined}
                onClick={() => go({ name: name } as never)}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main>
        {storageError.value && <div class="banner bad" role="alert">{storageError.value}</div>}
        {storageKind.value !== 'indexeddb' && !storageError.value && (
          <div class="banner info small">Skladište: {storageKind.value === 'localstorage' ? 'localStorage (IndexedDB nije dostupan)' : 'memorija'}.</div>
        )}
        {bundledNotice.value && (
          <div class="banner good small" role="status">
            <span>{bundledNotice.value}</span>
            <button class="btn sm ghost" onClick={() => (bundledNotice.value = null)}>OK</button>
          </div>
        )}
        {due && !inRun && (
          <div class="banner warn" role="status">
            <span>
              {lastBk == null
                ? 'Još nisi napravio backup podataka.'
                : `Poslednji backup je od pre ${Math.floor((Date.now() - lastBk) / 86400000)} dana.`}{' '}
              Podaci žive samo u ovom pregledaču.
            </span>
            <button class="btn sm" onClick={() => { exportBackup(); toast('Backup preuzet'); }}>Napravi backup</button>
            <button class="btn sm ghost" onClick={() => snoozeBackupBanner(1)}>Podseti me sutra</button>
          </div>
        )}
        {r.name === 'home' && <Home />}
        {r.name === 'library' && <Library />}
        {r.name === 'history' && <History />}
        {r.name === 'settings' && <SettingsPage />}
        {r.name === 'custom' && <Custom />}
        {r.name === 'run' && <Runner />}
        {r.name === 'results' && <Results attemptId={r.attemptId} />}
      </main>
      <ConfirmHost />
      <ToastHost />
    </>
  );
}
