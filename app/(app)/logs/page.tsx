'use client';

import clsx from 'clsx';
import { ScrollText } from 'lucide-react';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { LEVEL_CLS } from '@/components/TaskHistory';
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader } from '@/components/ui';
import { fmtDateTime } from '@/lib/client';
import type { MonitoringTask, TaskLog } from '@/lib/types';

export default function LogsPage() {
  const [level, setLevel] = useState('');
  const [task, setTask] = useState('');
  const [q, setQ] = useState('');
  const params = new URLSearchParams({ limit: '500', ...(level && { level }), ...(task && { task }) });
  const { data, error, mutate } = useSWR<{ logs: TaskLog[] }>(`/api/logs?${params}`, { refreshInterval: 10_000 });
  const { data: tasks } = useSWR<{ tasks: MonitoringTask[] }>('/api/tasks');
  const names = useMemo(() => new Map(tasks?.tasks.map((t) => [t.id, t.product_name])), [tasks]);
  const logs = (data?.logs ?? []).filter((l) => !q || l.message.toLowerCase().includes(q.toLowerCase()));
  const counts = (data?.logs ?? []).reduce<Record<string, number>>((a, l) => ({ ...a, [l.level]: (a[l.level] ?? 0) + 1 }), {});

  return (
    <>
      <PageHeader
        title="Monitoring logs"
        subtitle={data ? `${counts.error ?? 0} errors · ${counts.warn ?? 0} warnings in the latest ${data.logs.length} entries` : 'Every check outcome, retry and alert delivery'}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input w-64" placeholder="Filter messages…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-36" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Level">
          <option value="">All levels</option>
          <option value="info">Info</option>
          <option value="warn">Warning</option>
          <option value="error">Error</option>
        </select>
        <select className="input w-72" value={task} onChange={(e) => setTask(e.target.value)} aria-label="Task">
          <option value="">All tasks</option>
          {tasks?.tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.product_name}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <ErrorBlock error={error} retry={() => mutate()} />
      ) : !data ? (
        <LoadingBlock />
      ) : logs.length === 0 ? (
        <div className="panel">
          <EmptyState icon={<ScrollText className="h-5 w-5" />} title="No log entries">
            Logs appear as tasks are created and checks run.
          </EmptyState>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="max-h-[75vh] overflow-y-auto bg-ink-950/60 p-4 font-mono text-xs leading-relaxed">
            {logs.map((l) => (
              <div key={l.id} className="flex gap-3 rounded px-1 py-0.5 hover:bg-ink-800/50">
                <span className="w-32 shrink-0 text-ink-500">{fmtDateTime(l.created_at)}</span>
                <span className={clsx('w-12 shrink-0 font-semibold uppercase', LEVEL_CLS[l.level])}>{l.level}</span>
                <span className="w-64 shrink-0 truncate text-ink-300" title={l.task_id ? names.get(l.task_id) : undefined}>
                  {l.task_id ? (names.get(l.task_id) ?? 'deleted task') : 'system'}
                </span>
                <span className="text-ink-100">{l.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
