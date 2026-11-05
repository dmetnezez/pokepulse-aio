'use client';

import { Info } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { api, fmtDuration, fmtPrice } from '@/lib/client';
import { detectRetailer, RETAILER_MAP, RETAILERS } from '@/lib/retailers';
import { CATEGORIES, CATEGORY_LABELS, type Category, type MonitoringTask, type Product, type RetailerId } from '@/lib/types';
import { FREQUENCIES } from '@/lib/validation';
import { useToast } from './LiveProvider';
import { Modal, Spinner, Toggle } from './ui';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: (t: MonitoringTask) => void;
  /** edit an existing task */
  task?: MonitoringTask | null;
  /** pre-select a catalogue product */
  product?: Product | null;
  /** pre-select a retailer for the custom URL flow */
  retailer?: RetailerId | null;
}

type Mode = 'catalogue' | 'url';

export function TaskForm({ open, onClose, onSaved, task, product, retailer }: Props) {
  const toast = useToast();
  const editing = Boolean(task);
  const { data: catalogue } = useSWR<{ products: Product[] }>(open && !editing ? '/api/products?sort=name' : null);
  const { data: settings } = useSWR<{ settings: { default_frequency_sec: number } }>(open ? '/api/settings' : null);

  const [mode, setMode] = useState<Mode>('catalogue');
  const [productId, setProductId] = useState('');
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [retailerId, setRetailerId] = useState<RetailerId | ''>('');
  const [category, setCategory] = useState<Category>('etb');
  const [maxPrice, setMaxPrice] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [frequency, setFrequency] = useState(60);
  const [source, setSource] = useState<'simulated' | 'live'>('simulated');
  const [notify, setNotify] = useState({ discord: true, browser: true, email: false, telegram: false });
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (task) {
      setName(task.product_name);
      setMaxPrice(task.max_price?.toString() ?? '');
      setQuantity(task.quantity);
      setFrequency(task.frequency_sec);
      setSource(task.data_source);
      setNotify({ discord: task.notify_discord, browser: task.notify_browser, email: task.notify_email, telegram: task.notify_telegram });
      setActive(task.is_active);
    } else {
      setMode(retailer ? 'url' : 'catalogue');
      setProductId(product?.id ?? '');
      setSearch('');
      setName('');
      setUrl('');
      setRetailerId(retailer ?? '');
      setMaxPrice(product?.msrp ? (Math.round(product.msrp * 110) / 100).toFixed(2) : '');
      setQuantity(1);
      setFrequency(settings?.settings.default_frequency_sec ?? 60);
      setSource('simulated');
      setNotify({ discord: true, browser: true, email: false, telegram: false });
      setActive(true);
    }
  }, [open, task, product, retailer, settings?.settings.default_frequency_sec]);

  const selected = catalogue?.products.find((p) => p.id === productId) ?? (product?.id === productId ? product : null);
  const effectiveRetailer: RetailerId | null = editing
    ? task!.retailer_id
    : mode === 'catalogue'
      ? (selected?.retailer_id ?? null)
      : (detectRetailer(url) ?? (retailerId || null));
  const r = effectiveRetailer ? RETAILER_MAP[effectiveRetailer] : null;
  const liveAvailable = r?.integration_type !== 'none' && r != null;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (catalogue?.products ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || RETAILER_MAP[p.retailer_id].name.toLowerCase().includes(q)).slice(0, 80);
  }, [catalogue, search]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const common = {
      max_price: maxPrice ? Number(maxPrice) : null,
      quantity,
      frequency_sec: frequency,
      data_source: source,
      notify_discord: notify.discord,
      notify_browser: notify.browser,
      notify_email: notify.email,
      notify_telegram: notify.telegram,
      is_active: active,
    };
    try {
      if (editing) {
        const { task: saved } = await api<{ task: MonitoringTask }>(`/api/tasks/${task!.id}`, { method: 'PATCH', json: { ...common, product_name: name } });
        toast({ kind: 'success', title: 'Task updated' });
        onSaved?.(saved);
      } else {
        const body =
          mode === 'catalogue'
            ? { ...common, product_id: productId }
            : { ...common, product_name: name, product_url: url, retailer_id: retailerId || undefined, category };
        const res = await api<{ task: MonitoringTask; warnings: string[] }>('/api/tasks', { method: 'POST', json: body });
        toast({ kind: 'success', title: 'Monitoring task created', body: res.warnings.join(' · ') || undefined });
        onSaved?.(res.task);
      }
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit monitoring task' : 'New monitoring task'} wide>
      <form onSubmit={submit} className="space-y-5">
        {!editing && (
          <div className="inline-flex rounded-lg border border-ink-600 bg-ink-900 p-0.5 text-sm">
            {(['catalogue', 'url'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 font-medium transition ${mode === m ? 'bg-ink-700 text-white' : 'text-ink-300 hover:text-ink-100'}`}
              >
                {m === 'catalogue' ? 'From catalogue' : 'Custom product URL'}
              </button>
            ))}
          </div>
        )}

        {editing ? (
          <div>
            <label className="label">Product name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
            <p className="mt-1 text-xs text-ink-400">{task!.product_url}</p>
          </div>
        ) : mode === 'catalogue' ? (
          <div>
            <label className="label">Product</label>
            <input className="input mb-2" placeholder="Search catalogue (name or retailer)…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="max-h-56 overflow-y-auto rounded-lg border border-ink-700 bg-ink-900">
              {!catalogue && (
                <div className="flex items-center gap-2 p-3 text-sm text-ink-300">
                  <Spinner /> Loading catalogue…
                </div>
              )}
              {filtered.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => {
                    setProductId(p.id);
                    if (p.msrp && !maxPrice) setMaxPrice((Math.round(p.msrp * 110) / 100).toFixed(2));
                  }}
                  className={`flex w-full items-center justify-between gap-3 border-b border-ink-800 px-3 py-2 text-left text-sm last:border-0 ${
                    productId === p.id ? 'bg-volt-500/15 text-white' : 'text-ink-200 hover:bg-ink-800'
                  }`}
                >
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span className="shrink-0 text-xs text-ink-400">
                    {RETAILER_MAP[p.retailer_id].name.replace(' Canada', '')} · {fmtPrice(p.current_price)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label">Product URL</label>
              <input className="input" type="url" placeholder="https://www.bestbuy.ca/en-ca/product/…" value={url} onChange={(e) => setUrl(e.target.value)} required />
              {url && !detectRetailer(url) && <p className="mt-1 text-xs text-amber-300">Unrecognised domain — choose the retailer below.</p>}
            </div>
            <div>
              <label className="label">Product name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} placeholder="Prismatic Evolutions ETB" />
            </div>
            <div>
              <label className="label">Retailer</label>
              <select className="input" value={detectRetailer(url) ?? retailerId} disabled={Boolean(detectRetailer(url))} onChange={(e) => setRetailerId(e.target.value as RetailerId)} required>
                <option value="">Select…</option>
                {RETAILERS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label">Maximum price (CAD)</label>
            <input className="input" type="number" min="0" step="0.01" placeholder="No limit" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
          </div>
          <div>
            <label className="label">Desired quantity</label>
            <input className="input" type="number" min={1} max={20} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Check every</label>
            <select className="input" value={frequency} onChange={(e) => setFrequency(Number(e.target.value))}>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f} disabled={r ? f < r.min_interval_sec : false}>
                  {fmtDuration(f)}
                  {r && f < r.min_interval_sec ? ' (below retailer limit)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Data source</label>
          <div className="grid gap-2 md:grid-cols-2">
            <SourceOption checked={source === 'simulated'} onSelect={() => setSource('simulated')} title="Simulated" desc="Demo engine. Clearly labelled, never presented as real inventory." />
            <SourceOption
              checked={source === 'live'}
              onSelect={() => setSource('live')}
              title="Live (authorized API)"
              desc={liveAvailable ? `${r!.name}: ${r!.integration_notes}` : r ? `${r.name} has no authorized integration yet.` : 'Pick a product first.'}
              disabled={!liveAvailable}
            />
          </div>
        </div>

        <div>
          <label className="label">Notify me via</label>
          <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-lg border border-ink-700 bg-ink-900/60 p-3">
            <Toggle checked={notify.discord} onChange={(v) => setNotify((n) => ({ ...n, discord: v }))} label="Discord" />
            <Toggle checked={notify.browser} onChange={(v) => setNotify((n) => ({ ...n, browser: v }))} label="Browser" />
            <Toggle checked={notify.email} onChange={(v) => setNotify((n) => ({ ...n, email: v }))} label="Email" />
            <Toggle checked={notify.telegram} onChange={(v) => setNotify((n) => ({ ...n, telegram: v }))} label="Telegram" />
          </div>
          <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-400">
            <Info className="h-3 w-3" /> Channel credentials are configured on the Alerts page.
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-ink-700 pt-4">
          <Toggle checked={active} onChange={setActive} label={active ? 'Active' : 'Paused'} />
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" disabled={busy || (!editing && mode === 'catalogue' && !productId)}>
              {busy && <Spinner />} {editing ? 'Save changes' : 'Create task'}
            </button>
          </div>
        </div>
        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
      </form>
    </Modal>
  );
}

function SourceOption({ checked, onSelect, title, desc, disabled }: { checked: boolean; onSelect: () => void; title: string; desc: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'border-volt-500 bg-volt-500/10' : 'border-ink-700 bg-ink-900/60 hover:border-ink-500'
      }`}
    >
      <div className="text-sm font-medium text-ink-100">{title}</div>
      <div className="mt-0.5 line-clamp-3 text-xs text-ink-400">{desc}</div>
    </button>
  );
}
