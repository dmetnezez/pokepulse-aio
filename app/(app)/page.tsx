'use client';

import { Activity, AlertTriangle, CheckCircle2, Gauge, ListChecks, PackageCheck, Plus, ShoppingBag, Timer } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { ActivityFeed } from '@/components/ActivityFeed';
import { TaskForm } from '@/components/TaskForm';
import { ErrorBlock, LoadingBlock, PageHeader, Panel, RetailerTag, SimulatedBanner, StatCard, TaskStatusBadge, TimeAgo } from '@/components/ui';
import { fmtPrice } from '@/lib/client';
import type { ActivityItem, MonitoringTask, TaskStatus } from '@/lib/types';

interface Dashboard {
  activeTasks: number;
  totalTasks: number;
  statusCounts: Partial<Record<TaskStatus, number>>;
  inStock: number;
  inStockWatched: number;
  totalProducts: number;
  restocksToday: number;
  restocksTodayWatched: number;
  successfulPurchases: number;
  avgDetectionMs: number | null;
  recentActivity: ActivityItem[];
  simulatedShare: number;
  realOnly?: boolean;
  system: {
    store: string;
    workerMode: string;
    scheduler: { running: boolean; checksLastMinute: number; errorsLastMinute: number; queued: number; inflight: number; lastError: string | null } | null;
  };
}

const STATUS_ORDER: TaskStatus[] = ['restock_detected', 'monitoring', 'out_of_stock', 'paused', 'error'];

export default function DashboardPage() {
  const { data, error, mutate } = useSWR<Dashboard>('/api/dashboard', { refreshInterval: 15_000 });
  const { data: tasksData } = useSWR<{ tasks: MonitoringTask[] }>('/api/tasks', { refreshInterval: 20_000 });
  const [creating, setCreating] = useState(false);
  const watched = useMemo(() => new Set(tasksData?.tasks.map((t) => t.product_id)), [tasksData]);

  if (error) return <ErrorBlock error={error} retry={() => mutate()} />;
  if (!data) return <LoadingBlock label="Loading dashboard…" />;

  const hot = (tasksData?.tasks ?? [])
    .filter((t) => t.is_active || t.status === 'error')
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
    .slice(0, 8);
  const sched = data.system.scheduler;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Live restock intelligence across seven Canadian retailers"
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New task
          </button>
        }
      />
      <SimulatedBanner share={data.simulatedShare} />
      {data.realOnly && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-100/90">
          <span>
            <span className="font-semibold text-amber-200">Real data only.</span> Simulated stock is hidden and the simulator is off. Activity appears here when a
            Pokémon Center email arrives.
          </span>
          <Link href="/alerts" className="ml-auto font-medium text-amber-300 hover:text-amber-200">
            Inbox watcher settings →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Active tasks" value={data.activeTasks} sub={`${data.totalTasks} total`} icon={<ListChecks className="h-4 w-4" />} />
        <StatCard
          label="In stock now"
          value={data.inStock}
          sub={`${data.inStockWatched} on your tasks · ${data.totalProducts} listings`}
          icon={<PackageCheck className="h-4 w-4" />}
          accent="emerald"
        />
        <StatCard
          label="Restocks today"
          value={data.restocksToday}
          sub={`${data.restocksTodayWatched} on your tasks (since midnight ET)`}
          icon={<Activity className="h-4 w-4" />}
          accent="surge"
        />
        <StatCard label="Purchases" value={data.successfulPurchases} sub="Units you marked as bought" icon={<ShoppingBag className="h-4 w-4" />} accent="cyan" />
        <StatCard
          label="Avg detection"
          value={data.avgDetectionMs != null ? `${(data.avgDetectionMs / 1000).toFixed(2)}s` : '—'}
          sub="Check latency on restocks, 7 days"
          icon={<Timer className="h-4 w-4" />}
          accent="amber"
        />
        <StatCard
          label="Monitor"
          value={sched ? `${sched.checksLastMinute}/min` : 'External'}
          sub={
            sched
              ? `${sched.errorsLastMinute} errors · ${sched.queued} queued`
              : `Worker runs as a separate process (${data.system.store})`
          }
          icon={<Gauge className="h-4 w-4" />}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-6">
          <Panel
            title="Task status"
            action={
              <Link href="/tasks" className="text-xs font-medium text-volt-300 hover:text-volt-200">
                Manage tasks →
              </Link>
            }
            bodyClass="p-0"
          >
            <div className="grid grid-cols-5 border-b border-ink-700/70">
              {STATUS_ORDER.map((s) => (
                <div key={s} className="border-r border-ink-700/70 px-4 py-3 last:border-0">
                  <div className="text-2xl font-semibold tabular-nums text-white">{data.statusCounts[s] ?? 0}</div>
                  <div className="mt-1">
                    <TaskStatusBadge status={s} pulse={false} />
                  </div>
                </div>
              ))}
            </div>
            {hot.length === 0 ? (
              <div className="p-8 text-center text-sm text-ink-300">No active tasks. Create one to start monitoring.</div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th>Product</th>
                    <th>Retailer</th>
                    <th>Price / Max</th>
                    <th>Status</th>
                    <th>Last check</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700/50">
                  {hot.map((t) => (
                    <tr key={t.id} className="hover:bg-ink-800/40">
                      <td className="max-w-[280px] truncate px-4 py-2.5 text-ink-100">{t.product_name}</td>
                      <td className="px-4 py-2.5">
                        <RetailerTag id={t.retailer_id} short />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-ink-200">
                        {fmtPrice(t.last_price)} <span className="text-ink-500">/ {t.max_price ? fmtPrice(t.max_price) : 'any'}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <TaskStatusBadge status={t.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-300">
                        <TimeAgo iso={t.last_checked_at} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </Panel>

          <Panel title="System health">
            <div className="grid gap-4 text-sm md:grid-cols-3">
              <Health label="Storage" value={data.system.store === 'supabase' ? 'Supabase Postgres' : 'Local JSON store (demo)'} ok />
              <Health
                label="Scheduler"
                value={sched ? (sched.running ? `Running · ${sched.inflight} in flight` : 'Stopped') : 'External worker'}
                ok={sched ? sched.running : true}
              />
              <Health label="Last scheduler error" value={sched?.lastError ?? 'None'} ok={!sched?.lastError} />
            </div>
            <p className="mt-4 text-xs text-ink-400">
              Checks for the same product are de-duplicated across tasks and routed through per-retailer lanes that enforce each retailer’s concurrency
              and request-spacing limits. Failing checks back off exponentially.
            </p>
          </Panel>
        </div>

        <Panel
          title={
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulseDot rounded-full bg-emerald-400" /> Live activity
            </span>
          }
          bodyClass="max-h-[760px] overflow-y-auto p-0"
        >
          <ActivityFeed initial={data.recentActivity} watched={watched} limit={40} />
        </Panel>
      </div>

      <TaskForm open={creating} onClose={() => setCreating(false)} onSaved={() => mutate()} />
    </>
  );
}

function Health({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-3">
      <div className="text-xs text-ink-400">{label}</div>
      <div className="mt-1 flex items-center gap-2 text-ink-100">
        {ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />}
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}
