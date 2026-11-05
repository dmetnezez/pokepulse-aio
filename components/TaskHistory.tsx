'use client';

import clsx from 'clsx';
import useSWR from 'swr';
import { fmtDateTime, fmtDuration, fmtPrice } from '@/lib/client';
import type { MonitoringTask, NotificationRow, Product, StockHistoryRow, TaskLog } from '@/lib/types';
import { PriceChart } from './charts';
import { ErrorBlock, LoadingBlock, RetailerTag, SourceBadge, StockBadge, TaskStatusBadge, TimeAgo } from './ui';

interface Detail {
  task: MonitoringTask;
  product: Product | null;
  history: StockHistoryRow[];
  logs: TaskLog[];
  notifications: NotificationRow[];
}

export const LEVEL_CLS: Record<string, string> = {
  debug: 'text-ink-400',
  info: 'text-surge-300',
  warn: 'text-amber-300',
  error: 'text-red-300',
};

export function TaskHistory({ id }: { id: string }) {
  const { data, error, mutate } = useSWR<Detail>(`/api/tasks/${id}`, { refreshInterval: 10_000 });
  if (error) return <ErrorBlock error={error} retry={() => mutate()} />;
  if (!data) return <LoadingBlock />;
  const { task, product, history, logs, notifications } = data;
  const events = history.filter((h) => h.event_type !== 'check');

  return (
    <div className="space-y-6">
      <div>
        <div className="text-lg font-semibold text-white">{task.product_name}</div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <RetailerTag id={task.retailer_id} />
          <TaskStatusBadge status={task.status} />
          <SourceBadge source={task.data_source} />
          {product && <StockBadge status={product.stock_status} />}
        </div>
        {task.error_message && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{task.error_message}</div>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Stat label="Current price" value={fmtPrice(product?.current_price)} />
          <Stat label="Max price" value={task.max_price != null ? fmtPrice(task.max_price) : 'Any'} />
          <Stat label="Checks / restocks" value={`${task.check_count.toLocaleString()} / ${task.restock_count}`} />
          <Stat label="Frequency" value={`every ${fmtDuration(task.frequency_sec)}`} />
          <Stat label="Last check" value={<TimeAgo iso={task.last_checked_at} />} />
          <Stat label="Next check" value={task.is_active ? <TimeAgo iso={task.next_check_at} /> : 'Paused'} />
          <Stat label="Last restock" value={<TimeAgo iso={product?.last_restock_at} />} />
          <Stat label="Created" value={fmtDateTime(task.created_at)} />
        </dl>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink-100">Price & availability · 14 days</h3>
        <div className="rounded-xl border border-ink-700 bg-ink-850 p-3">
          <PriceChart history={[...history].reverse()} maxPrice={task.max_price} height={200} />
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink-100">Stock events</h3>
        {events.length === 0 ? (
          <p className="text-sm text-ink-400">No restocks or price changes in the last 14 days.</p>
        ) : (
          <ul className="divide-y divide-ink-800 rounded-xl border border-ink-700">
            {events.slice(0, 30).map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-28 shrink-0 text-xs tabular-nums text-ink-400">{fmtDateTime(h.checked_at)}</span>
                <span className="w-24 shrink-0 font-medium capitalize text-ink-100">{h.event_type.replace('_', ' ')}</span>
                <StockBadge status={h.stock_status} />
                <span className="ml-auto tabular-nums text-ink-200">{fmtPrice(h.price)}</span>
                <SourceBadge source={h.data_source} compact />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink-100">Alerts sent</h3>
        {notifications.length === 0 ? (
          <p className="text-sm text-ink-400">No alerts yet for this task.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {notifications.map((n) => (
              <li key={n.id} className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-xs text-ink-400">{fmtDateTime(n.created_at)}</span>
                <span className="w-16 capitalize text-ink-200">{n.channel}</span>
                <span className={clsx('text-xs font-semibold uppercase', n.status === 'sent' ? 'text-emerald-300' : n.status === 'failed' ? 'text-red-300' : 'text-ink-400')}>{n.status}</span>
                {n.error && <span className="truncate text-xs text-ink-400">{n.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink-100">Monitoring log</h3>
        <div className="max-h-80 overflow-y-auto rounded-xl border border-ink-700 bg-ink-950 p-3 font-mono text-xs leading-relaxed">
          {logs.length === 0 && <div className="text-ink-400">No log entries yet.</div>}
          {logs.map((l) => (
            <div key={l.id} className="flex gap-3">
              <span className="shrink-0 text-ink-500">{fmtDateTime(l.created_at)}</span>
              <span className={clsx('w-10 shrink-0 uppercase', LEVEL_CLS[l.level])}>{l.level}</span>
              <span className="text-ink-200">{l.message}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
      <dt className="text-[11px] text-ink-400">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums text-ink-100">{value}</dd>
    </div>
  );
}
