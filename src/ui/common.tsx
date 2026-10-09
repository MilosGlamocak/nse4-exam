import { signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { session } from '../store';

// ---------- toast ----------
export const toastMsg = signal<string | null>(null);
let toastTimer = 0;
export function toast(msg: string, ms = 2600): void {
  toastMsg.value = msg;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastMsg.value = null), ms);
}
export function ToastHost() {
  return toastMsg.value ? <div class="toast" role="status">{toastMsg.value}</div> : null;
}

// ---------- confirm dialog ----------
interface ConfirmState {
  title: string;
  body: ComponentChildren;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}
export const confirmState = signal<ConfirmState | null>(null);
export function askConfirm(s: Omit<ConfirmState, 'confirmLabel'> & { confirmLabel?: string }): void {
  confirmState.value = { confirmLabel: 'Potvrdi', ...s };
}
export function ConfirmHost() {
  const c = confirmState.value;
  if (!c) return null;
  const close = () => (confirmState.value = null);
  return (
    <Modal title={c.title} onClose={close}>
      <div>{c.body}</div>
      <div class="modal-actions">
        <button class="btn" onClick={close}>Odustani</button>
        <button
          class={'btn ' + (c.danger ? 'danger solid' : 'primary')}
          onClick={() => {
            close();
            c.onConfirm();
          }}
        >
          {c.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/** Runs `start`, but first asks for confirmation when another exam is still in progress (it would be discarded). */
export function guardStart(start: () => unknown): void {
  const cur = session.value;
  if (!cur) {
    start();
    return;
  }
  askConfirm({
    title: 'Ispit je već u toku',
    danger: true,
    confirmLabel: 'Odbaci i počni novi',
    body: <p>„{cur.name}“ još nije predan. Pokretanjem novog ispita on se odbacuje.</p>,
    onConfirm: () => void start(),
  });
}

// ---------- modal ----------
export const modalOpen = signal(0);

export function Modal(props: { title?: string; onClose: () => void; wide?: boolean; children: ComponentChildren }) {
  useEffect(() => {
    modalOpen.value++;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        props.onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      modalOpen.value--;
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);
  return (
    <div class="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class={'modal' + (props.wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={props.title}>
        {props.title && <h2>{props.title}</h2>}
        {props.children}
      </div>
    </div>
  );
}

// ---------- zoomable exhibit ----------
export function Exhibit({ src }: { src: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    modalOpen.value++;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      modalOpen.value--;
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  return (
    <figure class="exhibit">
      <img src={src} alt="Exhibit (klikni za uvećanje)" title="Klikni za uvećanje" onClick={() => setOpen(true)} />
      {open && (
        <div class="overlay" onClick={() => setOpen(false)}>
          <img class="zoom" src={src} alt="Exhibit" />
        </div>
      )}
    </figure>
  );
}

// ---------- clipboard ----------
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

// ---------- charts ----------
export interface BarDatum {
  key: string;
  label: string;
  percent: number;
  detail: string;
}

/**
 * Single-series horizontal bars. Fill colour is a redundant status cue (below / at-or-above pass mark);
 * the exact numbers are always printed, so nothing depends on colour alone.
 */
export function Bars({ data, passPercent, noLabels }: { data: BarDatum[]; passPercent?: number; noLabels?: boolean }) {
  if (!data.length) return <p class="muted">Nema podataka.</p>;
  return (
    <div class={'bars' + (noLabels ? ' nolabel' : '')}>
      {data.map((d) => {
        const cls = passPercent == null ? '' : d.percent + 1e-9 >= passPercent ? 'ok' : 'low';
        return (
          <div class="barrow" key={d.key} title={`${d.label}: ${d.detail}`}>
            {!noLabels && <span class="lbl">{d.label}</span>}
            <span class="track" role="img" aria-label={`${d.label} ${Math.round(d.percent)}%`}>
              <span class={'fill ' + cls} style={{ width: `${Math.max(0, Math.min(100, d.percent))}%` }} />
              {passPercent != null && <span class="passline" style={{ left: `${passPercent}%` }} />}
            </span>
            <span class="val">{d.detail}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  const w = 96;
  const h = 26;
  if (values.length < 2) return <span class="muted small">{values.length ? '1 pokušaj' : '–'}</span>;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 6) + 3, h - 3 - (Math.max(0, Math.min(100, v)) / 100) * (h - 6)]);
  const last = pts[pts.length - 1];
  return (
    <svg class="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Trend: ${values.map((v) => Math.round(v) + '%').join(', ')}`}>
      <title>{values.map((v) => Math.round(v) + '%').join(' → ')}</title>
      <polyline fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points={pts.map((p) => p.join(',')).join(' ')} />
      <circle cx={last[0]} cy={last[1]} r="3" fill="var(--accent)" stroke="var(--surface)" stroke-width="2" />
    </svg>
  );
}

export function Tabs<T extends string>(props: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div class="tabs" role="tablist">
      {props.options.map(([v, label]) => (
        <button class="tab" role="tab" aria-selected={props.value === v} onClick={() => props.onChange(v)} key={v}>
          {label}
        </button>
      ))}
    </div>
  );
}
