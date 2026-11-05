'use client';

import clsx from 'clsx';
import { CircleSlash, KeyRound, Link2, Plus, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';
import { TaskForm } from '@/components/TaskForm';
import { ErrorBlock, LoadingBlock, PageHeader, TimeAgo } from '@/components/ui';
import { fmtDuration } from '@/lib/client';
import type { Retailer, RetailerId } from '@/lib/types';

type Row = Retailer & {
  live: { available: boolean; configured: boolean };
  listings: number;
  inStock: number;
  tasks: number;
  activeTasks: number;
  erroredTasks: number;
  lastRestockAt: string | null;
};

function IntegrationPill({ r }: { r: Row }) {
  if (r.live.available && r.live.configured)
    return (
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
        <ShieldCheck className="h-3 w-3" /> Live integration active
      </span>
    );
  if (r.live.available)
    return (
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300 ring-1 ring-inset ring-amber-500/30">
        <KeyRound className="h-3 w-3" /> Needs API credentials
      </span>
    );
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-ink-600/30 px-2 py-0.5 text-[11px] font-semibold text-ink-300 ring-1 ring-inset ring-ink-500/40">
      <CircleSlash className="h-3 w-3" /> Simulated only
    </span>
  );
}

export default function RetailersPage() {
  const { data, error, mutate } = useSWR<{ retailers: Row[] }>('/api/retailers', { refreshInterval: 20_000 });
  const [adding, setAdding] = useState<RetailerId | null>(null);

  if (error) return <ErrorBlock error={error} retry={() => mutate()} />;
  if (!data) return <LoadingBlock />;

  return (
    <>
      <PageHeader title="Retailers" subtitle="Seven Canadian retailers · integration status and rate limits" />

      <div className="mb-6 rounded-xl border border-ink-700 bg-ink-850/80 p-4 text-sm leading-relaxed text-ink-300">
        <div className="mb-1 flex items-center gap-2 font-semibold text-ink-100">
          <ShieldCheck className="h-4 w-4 text-volt-300" /> Compliance by design
        </div>
        PokéPulse only reads live stock through official APIs, affiliate programs or permitted product feeds. It never scrapes behind bot protection, solves
        CAPTCHAs, skips virtual queues, or circumvents purchase limits. Each retailer has a minimum check interval, a concurrency cap and request spacing that the
        scheduler enforces for every task. Retailers without an authorized integration run on the clearly-labelled simulation engine.
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.retailers.map((r) => (
          <article key={r.id} className="panel flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl text-sm font-bold text-black" style={{ background: r.brand_color }}>
                  {r.name
                    .split(' ')
                    .filter((w) => w !== 'Canada')
                    .map((w) => w[0])
                    .join('')
                    .slice(0, 3)}
                </div>
                <div>
                  <h3 className="font-semibold text-white">{r.name}</h3>
                  <div className="text-xs text-ink-400">{r.domain}</div>
                </div>
              </div>
              <IntegrationPill r={r} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-300">{r.integration_notes}</p>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <Metric label="Listings" value={r.listings} />
              <Metric label="In stock" value={r.inStock} highlight={r.inStock > 0} />
              <Metric label="Your tasks" value={`${r.activeTasks}/${r.tasks}`} warn={r.erroredTasks > 0} />
            </dl>
            <div className="mt-4 space-y-1 text-xs text-ink-400">
              <div className="flex justify-between">
                <span>Min. check interval</span>
                <span className="text-ink-200">{fmtDuration(r.min_interval_sec)}</span>
              </div>
              <div className="flex justify-between">
                <span>Concurrency / spacing</span>
                <span className="text-ink-200">
                  {r.max_concurrency} · {r.request_spacing_ms} ms
                </span>
              </div>
              <div className="flex justify-between">
                <span>Last restock seen</span>
                <span className="text-ink-200">
                  <TimeAgo iso={r.lastRestockAt} />
                </span>
              </div>
              {r.erroredTasks > 0 && <div className="text-red-300">{r.erroredTasks} task(s) in error — see Logs</div>}
            </div>
            <div className="mt-auto flex gap-2 pt-5">
              <button className="btn-primary btn-sm flex-1" onClick={() => setAdding(r.id)}>
                <Plus className="h-3.5 w-3.5" /> Add product URL
              </button>
              <a className="btn-secondary btn-sm" href={`https://www.${r.domain}`} target="_blank" rel="noopener noreferrer">
                <Link2 className="h-3.5 w-3.5" /> Site
              </a>
            </div>
          </article>
        ))}
      </div>

      <TaskForm open={Boolean(adding)} retailer={adding} onClose={() => setAdding(null)} onSaved={() => mutate()} />
    </>
  );
}

function Metric({ label, value, highlight, warn }: { label: string; value: React.ReactNode; highlight?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900/60 py-2">
      <div className={clsx('text-lg font-semibold tabular-nums', highlight ? 'text-emerald-300' : warn ? 'text-red-300' : 'text-white')}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-ink-400">{label}</div>
    </div>
  );
}
