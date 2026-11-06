'use client';

import clsx from 'clsx';
import { Copy, ExternalLink, History, ListChecks, MoreHorizontal, Pause, Pencil, Play, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useToast } from '@/components/LiveProvider';
import { TaskForm } from '@/components/TaskForm';
import { TaskHistory } from '@/components/TaskHistory';
import { Drawer, EmptyState, ErrorBlock, LoadingBlock, PageHeader, RetailerTag, SourceBadge, TaskStatusBadge, TimeAgo, WatchBadge } from '@/components/ui';
import { api, fmtDuration, fmtPrice } from '@/lib/client';
import { RETAILERS } from '@/lib/retailers';
import type { MonitoringTask, TaskStatus } from '@/lib/types';

const STATUSES: { id: TaskStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'monitoring', label: 'Monitoring' },
  { id: 'restock_detected', label: 'Restock detected' },
  { id: 'out_of_stock', label: 'Out of stock' },
  { id: 'paused', label: 'Paused' },
  { id: 'error', label: 'Error' },
];

const PAGE_SIZE = 50;

export default function TasksPage() {
  const toast = useToast();
  const { data, error, mutate } = useSWR<{ tasks: MonitoringTask[] }>('/api/tasks', { refreshInterval: 10_000 });
  const [status, setStatus] = useState<TaskStatus | 'all'>('all');
  const [retailer, setRetailer] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<MonitoringTask | null>(null);
  const [creating, setCreating] = useState(false);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (status === 'all' || t.status === status) &&
          (!retailer || t.retailer_id === retailer) &&
          (!q || t.product_name.toLowerCase().includes(q.toLowerCase())),
      ),
    [tasks, status, retailer, q],
  );
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const counts = useMemo(() => tasks.reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.status]: (acc[t.status] ?? 0) + 1 }), {}), [tasks]);

  const run = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn();
      toast({ kind: 'success', title: success });
      await mutate();
    } catch (err) {
      toast({ kind: 'error', title: (err as Error).message });
    }
  };

  const bulk = (action: 'pause' | 'resume' | 'delete' | 'check_now') => {
    if (action === 'delete' && !confirm(`Delete ${selected.size} task(s)? This also removes their logs.`)) return;
    void run(async () => {
      await api('/api/tasks/bulk', { method: 'POST', json: { ids: [...selected], action } });
      setSelected(new Set());
    }, `${selected.size} task(s) updated`);
  };

  const toggleAll = () => setSelected((s) => (s.size === pageItems.length ? new Set() : new Set(pageItems.map((t) => t.id))));

  if (error) return <ErrorBlock error={error} retry={() => mutate()} />;
  if (!data) return <LoadingBlock label="Loading tasks…" />;

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={`${tasks.filter((t) => t.is_active).length} active of ${tasks.length} monitoring tasks`}
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New task
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setStatus(s.id);
              setPage(0);
            }}
            className={clsx(
              'rounded-full border px-3 py-1 text-xs font-medium transition',
              status === s.id ? 'border-volt-500/60 bg-volt-500/15 text-white' : 'border-ink-700 text-ink-300 hover:border-ink-500 hover:text-ink-100',
            )}
          >
            {s.label}
            <span className="ml-1.5 text-ink-400">{s.id === 'all' ? tasks.length : (counts[s.id] ?? 0)}</span>
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-400" />
            <input className="input w-56 pl-8" placeholder="Search tasks" value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} />
          </div>
          <select className="input w-48" value={retailer} onChange={(e) => (setRetailer(e.target.value), setPage(0))}>
            <option value="">All retailers</option>
            {RETAILERS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex animate-slideIn flex-wrap items-center gap-2 rounded-xl border border-volt-500/30 bg-volt-500/10 px-4 py-2.5 text-sm">
          <span className="font-medium text-white">{selected.size} selected</span>
          <div className="ml-auto flex gap-2">
            <button className="btn-secondary btn-sm" onClick={() => bulk('resume')}>
              <Play className="h-3.5 w-3.5" /> Resume
            </button>
            <button className="btn-secondary btn-sm" onClick={() => bulk('pause')}>
              <Pause className="h-3.5 w-3.5" /> Pause
            </button>
            <button className="btn-secondary btn-sm" onClick={() => bulk('check_now')}>
              <RefreshCw className="h-3.5 w-3.5" /> Check now
            </button>
            <button className="btn-danger btn-sm" onClick={() => bulk('delete')}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </div>
      )}

      <div className="panel overflow-hidden xl:overflow-visible">
        {filtered.length === 0 ? (
          <EmptyState icon={<ListChecks className="h-5 w-5" />} title={tasks.length ? 'No tasks match these filters' : 'No monitoring tasks yet'}>
            {tasks.length ? 'Try a different status or retailer.' : 'Create a task from the catalogue or paste a product URL from a supported retailer.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto xl:overflow-visible">
            <table className="w-full text-sm">
              <thead className="table-head border-b border-ink-700/70 bg-ink-900/40">
                <tr>
                  <th className="w-10 !pr-0">
                    <input type="checkbox" className="accent-volt-500" checked={selected.size > 0 && selected.size === pageItems.length} onChange={toggleAll} aria-label="Select all" />
                  </th>
                  <th>Product</th>
                  <th>Retailer</th>
                  <th>Status</th>
                  <th>Price / Max</th>
                  <th>Qty · Every</th>
                  <th>Last check</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/50">
                {pageItems.map((t) => (
                  <tr key={t.id} className={clsx('group hover:bg-ink-800/40', selected.has(t.id) && 'bg-volt-500/[0.06]')}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="accent-volt-500"
                        checked={selected.has(t.id)}
                        onChange={() =>
                          setSelected((s) => {
                            const n = new Set(s);
                            if (n.has(t.id)) n.delete(t.id);
                            else n.add(t.id);
                            return n;
                          })
                        }
                        aria-label={`Select ${t.product_name}`}
                      />
                    </td>
                    <td className="max-w-[260px] px-4 py-3">
                      <div className="truncate font-medium text-ink-100">{t.product_name}</div>
                      <div className="mt-1 flex items-center gap-2">
                        {'watch' in t ? <WatchBadge watch={(t as MonitoringTask & { watch: 'email' | 'api' | 'none' }).watch} /> : <SourceBadge source={t.data_source} compact />}
                        {t.error_message && t.status === 'error' && (
                          <span className="truncate text-[11px] text-red-300" title={t.error_message}>
                            {t.error_message}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <RetailerTag id={t.retailer_id} short />
                    </td>
                    <td className="px-4 py-3">
                      <TaskStatusBadge status={t.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      <span className={clsx(t.max_price != null && t.last_price != null && t.last_price > t.max_price ? 'text-amber-300' : 'text-ink-100')}>
                        {fmtPrice(t.last_price)}
                      </span>
                      <span className="text-ink-500"> / {t.max_price != null ? fmtPrice(t.max_price) : 'any'}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink-200">
                      {t.quantity} · {fmtDuration(t.frequency_sec)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-300">
                      <TimeAgo iso={t.last_checked_at} />
                      <div className="text-[11px] text-ink-500" title="checks · restocks detected">
                        {t.check_count.toLocaleString()} checks{t.restock_count > 0 && <span className="text-emerald-300"> · {t.restock_count} restocks</span>}
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex justify-end gap-0">
                        {t.is_active ? (
                          <IconBtn title="Pause" onClick={() => run(() => api(`/api/tasks/${t.id}`, { method: 'PATCH', json: { is_active: false } }), 'Task paused')}>
                            <Pause className="h-4 w-4" />
                          </IconBtn>
                        ) : (
                          <IconBtn title="Resume" onClick={() => run(() => api(`/api/tasks/${t.id}`, { method: 'PATCH', json: { is_active: true } }), 'Task resumed')}>
                            <Play className="h-4 w-4" />
                          </IconBtn>
                        )}
                        <IconBtn title="Check now" disabled={!t.is_active} onClick={() => run(() => api(`/api/tasks/${t.id}/check`, { method: 'POST' }), 'Check queued')}>
                          <RefreshCw className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn title="History" onClick={() => setHistoryId(t.id)}>
                          <History className="h-4 w-4" />
                        </IconBtn>
                        <RowMenu
                          onEdit={() => setEditing(t)}
                          onDuplicate={() => run(() => api(`/api/tasks/${t.id}/duplicate`, { method: 'POST' }), 'Task duplicated (paused)')}
                          url={t.product_url}
                          onDelete={() => confirm(`Delete "${t.product_name}"?`) && run(() => api(`/api/tasks/${t.id}`, { method: 'DELETE' }), 'Task deleted')}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-ink-700/70 px-4 py-2.5 text-xs text-ink-300">
            <span>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex gap-2">
              <button className="btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button className="btn-secondary btn-sm" disabled={(page + 1) * PAGE_SIZE >= filtered.length} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <TaskForm open={creating} onClose={() => setCreating(false)} onSaved={() => mutate()} />
      <TaskForm open={Boolean(editing)} task={editing} onClose={() => setEditing(null)} onSaved={() => mutate()} />
      <Drawer open={Boolean(historyId)} onClose={() => setHistoryId(null)} title="Task history">
        {historyId && <TaskHistory id={historyId} />}
      </Drawer>
    </>
  );
}

function RowMenu({ onEdit, onDuplicate, onDelete, url }: { onEdit: () => void; onDuplicate: () => void; onDelete: () => void; url: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const item = 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-200 hover:bg-ink-700 hover:text-white';
  return (
    <div className="relative" ref={ref}>
      <IconBtn title="More actions" onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal className="h-4 w-4" />
      </IconBtn>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-lg border border-ink-600 bg-ink-800 py-1 shadow-2xl">
          <button role="menuitem" className={item} onClick={() => (setOpen(false), onEdit())}>
            <Pencil className="h-4 w-4" /> Edit task
          </button>
          <button role="menuitem" className={item} onClick={() => (setOpen(false), onDuplicate())}>
            <Copy className="h-4 w-4" /> Duplicate
          </button>
          <a role="menuitem" className={item} href={url} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
            <ExternalLink className="h-4 w-4" /> Open retailer page
          </a>
          <div className="my-1 border-t border-ink-700" />
          <button role="menuitem" className={clsx(item, 'text-red-300 hover:bg-red-500/15 hover:text-red-200')} onClick={() => (setOpen(false), onDelete())}>
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, title, onClick, danger, disabled }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'rounded-md p-1.5 text-ink-400 transition disabled:opacity-30',
        danger ? 'hover:bg-red-500/15 hover:text-red-300' : 'hover:bg-ink-700 hover:text-ink-100',
      )}
    >
      {children}
    </button>
  );
}
