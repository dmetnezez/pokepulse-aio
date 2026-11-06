'use client';

import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, CircleDashed, FlaskConical, Loader2, Mail, PauseCircle, Radar, ShieldCheck, X, XCircle, Zap } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { RETAILER_MAP } from '@/lib/retailers';
import type { DataSource, RetailerId, StockStatus, TaskStatus } from '@/lib/types';
import { timeAgo } from '@/lib/client';

export function Panel({ title, action, children, className, bodyClass }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={clsx('panel', className)}>
      {(title || action) && (
        <header className="panel-head">
          <h2 className="panel-title">{title}</h2>
          {action}
        </header>
      )}
      <div className={clsx(bodyClass ?? 'p-5')}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-300">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, icon, accent = 'volt' }: { label: string; value: ReactNode; sub?: ReactNode; icon: ReactNode; accent?: 'volt' | 'surge' | 'emerald' | 'amber' | 'cyan' }) {
  const ring = {
    volt: 'from-volt-500/25 text-volt-300',
    surge: 'from-surge-500/25 text-surge-300',
    emerald: 'from-emerald-500/20 text-emerald-300',
    amber: 'from-amber-500/20 text-amber-300',
    cyan: 'from-cyan-500/20 text-cyan-300',
  }[accent];
  return (
    <div className="panel relative overflow-hidden p-4">
      <div className="flex items-start justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-ink-400">{label}</div>
        <div className={clsx('grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br to-transparent', ring)}>{icon}</div>
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-white tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-300">{sub}</div>}
    </div>
  );
}

const TASK_STATUS: Record<TaskStatus, { label: string; cls: string; icon: ReactNode }> = {
  monitoring: { label: 'Monitoring', cls: 'bg-surge-500/10 text-surge-300 ring-surge-500/30', icon: <Radar className="h-3 w-3" /> },
  restock_detected: { label: 'Restock detected', cls: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40', icon: <Zap className="h-3 w-3" /> },
  out_of_stock: { label: 'Out of stock', cls: 'bg-ink-600/30 text-ink-200 ring-ink-500/40', icon: <XCircle className="h-3 w-3" /> },
  paused: { label: 'Paused', cls: 'bg-amber-500/10 text-amber-300 ring-amber-500/30', icon: <PauseCircle className="h-3 w-3" /> },
  error: { label: 'Error', cls: 'bg-red-500/10 text-red-300 ring-red-500/40', icon: <AlertTriangle className="h-3 w-3" /> },
};

export function TaskStatusBadge({ status, pulse = true }: { status: TaskStatus; pulse?: boolean }) {
  const s = TASK_STATUS[status];
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', s.cls)}>
      {pulse && (status === 'monitoring' || status === 'restock_detected') ? (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      ) : (
        s.icon
      )}
      {s.label}
    </span>
  );
}

const STOCK: Record<StockStatus, { label: string; cls: string }> = {
  in_stock: { label: 'In stock', cls: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/30' },
  limited: { label: 'Limited', cls: 'text-amber-300 bg-amber-500/10 ring-amber-500/30' },
  out_of_stock: { label: 'Sold out', cls: 'text-ink-300 bg-ink-600/25 ring-ink-500/30' },
  preorder: { label: 'Pre-order', cls: 'text-cyan-300 bg-cyan-500/10 ring-cyan-500/30' },
  unknown: { label: 'No data yet', cls: 'text-ink-300 bg-ink-600/25 ring-ink-500/30' },
};

export function StockBadge({ status }: { status: StockStatus }) {
  const s = STOCK[status];
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset', s.cls)}>
      {status === 'in_stock' || status === 'limited' ? <CheckCircle2 className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
      {s.label}
    </span>
  );
}

/** Always shown next to stock data so simulated numbers are never mistaken for verified live inventory. */
export function SourceBadge({ source, compact }: { source: DataSource; compact?: boolean }) {
  if (source === 'email')
    return (
      <span title="Triggered by a Pokémon Center email in your inbox" className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300 ring-1 ring-inset ring-amber-400/30">
        <Mail className="h-3 w-3" />
        {compact ? 'Email' : 'Retailer email'}
      </span>
    );
  return source === 'live' ? (
    <span title="Returned by an authorized retailer integration" className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
      <ShieldCheck className="h-3 w-3" />
      {compact ? 'Live' : 'Live verified'}
    </span>
  ) : (
    <span title="Generated by the simulation engine — not verified live inventory" className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-fuchsia-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-300 ring-1 ring-inset ring-fuchsia-500/30">
      <FlaskConical className="h-3 w-3" />
      {compact ? 'Sim' : 'Simulated'}
    </span>
  );
}

/** How a task gets real data in "real data only" mode. */
export function WatchBadge({ watch }: { watch: 'email' | 'api' | 'none' }) {
  if (watch === 'api') return <SourceBadge source="live" compact />;
  return watch === 'email' ? (
    <span title="Watched through your Pokémon Center emails" className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300 ring-1 ring-inset ring-amber-400/30">
      <Mail className="h-3 w-3" /> Email watch
    </span>
  ) : (
    <span title="This retailer has no real data source — no alerts will fire for this task in real-only mode" className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-ink-600/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-300 ring-1 ring-inset ring-ink-500/40">
      No real source
    </span>
  );
}

export function RetailerTag({ id, short }: { id: RetailerId; short?: boolean }) {
  const r = RETAILER_MAP[id];
  if (!r) return <span>{id}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-200">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.brand_color }} />
      {short ? r.name.replace(' Canada', '') : r.name}
    </span>
  );
}

export function TimeAgo({ iso }: { iso: string | null | undefined }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <time suppressHydrationWarning dateTime={iso ?? undefined} title={iso ? new Date(iso).toLocaleString('en-CA') : undefined}>
      {timeAgo(iso)}
    </time>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={clsx('inline-flex cursor-pointer select-none items-center gap-2.5 text-sm text-ink-200', disabled && 'cursor-not-allowed opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx('relative h-5 w-9 shrink-0 rounded-full transition', checked ? 'bg-volt-600' : 'bg-ink-600')}
      >
        <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
      {label}
    </label>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[8vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={clsx('panel w-full animate-slideIn bg-ink-850', wide ? 'max-w-3xl' : 'max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="panel-head">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onMouseDown={onClose}>
      <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-ink-700 bg-ink-900" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-ink-700 bg-ink-900/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0 text-base font-semibold text-white">{title}</div>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </aside>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-ink-800 text-ink-300 ring-1 ring-ink-700">{icon}</div>
      <div className="text-sm font-semibold text-ink-100">{title}</div>
      {children && <div className="mt-1 max-w-sm text-sm text-ink-300">{children}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('h-4 w-4 animate-spin', className)} />;
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-300">
      <Spinner /> {label}
    </div>
  );
}

export function ErrorBlock({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-6 py-10 text-center">
      <AlertTriangle className="h-6 w-6 text-red-300" />
      <div className="text-sm text-red-200">{error.message}</div>
      {retry && (
        <button className="btn-secondary btn-sm" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function SimulatedBanner({ share }: { share: number }) {
  if (share <= 0) return null;
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-fuchsia-500/25 bg-fuchsia-500/[0.06] px-4 py-3 text-sm text-fuchsia-100/90">
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-300" />
      <div>
        <span className="font-semibold text-fuchsia-200">{Math.round(share * 100)}% of stock data is simulated.</span>{' '}
        Items tagged <SourceBadge source="simulated" compact /> come from the demo engine, not a retailer. Only{' '}
        <SourceBadge source="live" compact /> data is verified live inventory from an authorized integration.
      </div>
    </div>
  );
}
