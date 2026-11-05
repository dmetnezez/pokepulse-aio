'use client';

import clsx from 'clsx';
import { BellPlus, CheckCircle2, ExternalLink, Lock, Minus, Plus, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';
import { useToast } from '@/components/LiveProvider';
import { ProductArt } from '@/components/ProductArt';
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader, Panel, RetailerTag, SourceBadge, StockBadge, TimeAgo } from '@/components/ui';
import { api, fmtDateTime, fmtPrice } from '@/lib/client';
import { retailerName } from '@/lib/retailers';
import type { MonitoringTask, Product, PurchaseActivity, PurchaseAction } from '@/lib/types';

interface Item {
  task: MonitoringTask;
  product: Product;
  available: boolean;
  priceOk: boolean;
  ready: boolean;
}

const ACTION_LABEL: Record<PurchaseAction, string> = {
  opened_page: 'Opened retailer page',
  prepared: 'Prepared quantity',
  checkout_ready: 'Checkout-ready alert sent',
  purchased: 'Marked as purchased',
  cancelled: 'Cancelled',
};

export default function PurchasePage() {
  const toast = useToast();
  const { data, error, mutate } = useSWR<{ items: Item[]; activity: PurchaseActivity[] }>('/api/purchase', { refreshInterval: 10_000 });
  const [filter, setFilter] = useState<'ready' | 'all'>('ready');

  if (error) return <ErrorBlock error={error} retry={() => mutate()} />;
  if (!data) return <LoadingBlock />;

  const record = async (item: Item, action: PurchaseAction, quantity: number) => {
    try {
      const res = await api<{ notified: boolean; armed: boolean }>('/api/purchase', {
        method: 'POST',
        json: { task_id: item.task.id, product_id: item.product.id, action, quantity, unit_price: item.product.current_price },
      });
      if (action === 'checkout_ready')
        toast(
          res.notified
            ? { kind: 'success', title: 'Checkout-ready alert sent', body: 'Sent on this task’s notification channels.' }
            : { kind: 'info', title: 'Armed', body: 'Not available right now — you’ll be alerted the moment it restocks.' },
        );
      else if (action === 'purchased') toast({ kind: 'success', title: `Logged ${quantity} × ${item.product.name}` });
      else if (action === 'prepared') toast({ kind: 'success', title: `Quantity set to ${quantity}` });
      await mutate();
    } catch (err) {
      toast({ kind: 'error', title: (err as Error).message });
    }
  };

  const items = filter === 'ready' ? data.items.filter((i) => i.available) : data.items;
  const readyCount = data.items.filter((i) => i.ready).length;

  return (
    <>
      <PageHeader title="Purchase Assistant" subtitle={`${readyCount} product(s) in stock within your max price`} />

      <div className="mb-6 flex items-start gap-3 rounded-xl border border-ink-700 bg-ink-850/80 px-4 py-3 text-sm text-ink-300">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-volt-300" />
        <div>
          Checkout always happens on the retailer’s own site, in your own browser session. PokéPulse never stores card details, never auto-submits orders, and never
          bypasses queues or per-customer purchase limits. It gets you to the right page, at the right price, with your quantity decided — fast.
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="mb-4 inline-flex rounded-lg border border-ink-600 bg-ink-900 p-0.5 text-sm">
            {(['ready', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={clsx('rounded-md px-3 py-1.5 font-medium transition', filter === f ? 'bg-ink-700 text-white' : 'text-ink-300 hover:text-ink-100')}
              >
                {f === 'ready' ? 'Available now' : 'All watched products'}
              </button>
            ))}
          </div>
          {items.length === 0 ? (
            <div className="panel">
              <EmptyState icon={<ShoppingCart className="h-5 w-5" />} title={filter === 'ready' ? 'Nothing in stock right now' : 'No watched products'}>
                {filter === 'ready'
                  ? 'Arm “Notify when checkout is available” on a product and you’ll get an alert the moment it restocks.'
                  : 'Create a monitoring task to see it here.'}
              </EmptyState>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((i) => (
                <PurchaseCard key={i.task.id} item={i} onAction={record} />
              ))}
            </div>
          )}
        </div>

        <Panel title="Your purchase activity" bodyClass="max-h-[720px] overflow-y-auto p-0">
          {data.activity.length === 0 ? (
            <p className="p-5 text-sm text-ink-400">Actions you take here are logged for your records.</p>
          ) : (
            <ul className="divide-y divide-ink-700/60">
              {data.activity.map((a) => {
                const item = data.items.find((i) => i.product.id === a.product_id);
                return (
                  <li key={a.id} className="px-5 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className={clsx('font-medium', a.action === 'purchased' ? 'text-emerald-300' : 'text-ink-100')}>{ACTION_LABEL[a.action]}</span>
                      <span className="text-[11px] text-ink-400">{fmtDateTime(a.created_at)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-ink-300">
                      {a.quantity} × {item?.product.name ?? 'Product'} {a.unit_price != null && `@ ${fmtPrice(a.unit_price)}`}
                      {item && ` · ${retailerName(item.product.retailer_id)}`}
                    </div>
                    {a.note && <div className="mt-0.5 text-xs text-ink-400">{a.note}</div>}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

function PurchaseCard({ item, onAction }: { item: Item; onAction: (i: Item, a: PurchaseAction, q: number) => Promise<void> }) {
  const { task, product, available, priceOk, ready } = item;
  const [qty, setQty] = useState(task.quantity);
  const [busy, setBusy] = useState<PurchaseAction | null>(null);
  const go = async (a: PurchaseAction) => {
    setBusy(a);
    await onAction(item, a, qty);
    setBusy(null);
  };
  const total = product.current_price != null ? product.current_price * qty : null;

  return (
    <article className={clsx('panel flex flex-col gap-4 p-4 md:flex-row', ready && 'border-emerald-500/40 shadow-[0_0_0_1px_rgba(16,185,129,.15)]')}>
      <ProductArt name={product.name} setName={product.set_name} category={product.category} imageUrl={product.image_url} className="h-28 w-full shrink-0 rounded-lg md:w-36" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {ready && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
              <CheckCircle2 className="h-3 w-3" /> Ready to buy
            </span>
          )}
          <StockBadge status={product.stock_status} />
          <SourceBadge source={product.data_source} compact />
        </div>
        <h3 className="mt-1.5 truncate font-semibold text-white">{product.name}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-400">
          <RetailerTag id={product.retailer_id} />
          <span>
            Checked <TimeAgo iso={product.last_checked_at} />
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-6">
          <div>
            <div className="text-[11px] text-ink-400">Price</div>
            <div className={clsx('text-lg font-semibold tabular-nums', priceOk ? 'text-white' : 'text-amber-300')}>{fmtPrice(product.current_price)}</div>
            <div className="text-[11px] text-ink-400">{task.max_price != null ? `max ${fmtPrice(task.max_price)}${priceOk ? '' : ' — over budget'}` : 'no max set'}</div>
          </div>
          <div>
            <div className="mb-1 text-[11px] text-ink-400">Quantity</div>
            <div className="flex items-center rounded-lg border border-ink-600 bg-ink-900">
              <button className="px-2 py-1.5 text-ink-300 hover:text-white disabled:opacity-30" disabled={qty <= 1} onClick={() => setQty((q) => q - 1)} aria-label="Decrease">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-8 text-center text-sm font-semibold tabular-nums text-white">{qty}</span>
              <button className="px-2 py-1.5 text-ink-300 hover:text-white disabled:opacity-30" disabled={qty >= 20} onClick={() => setQty((q) => q + 1)} aria-label="Increase">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div>
            <div className="text-[11px] text-ink-400">Est. subtotal</div>
            <div className="text-lg font-semibold tabular-nums text-ink-100">{fmtPrice(total)}</div>
            <div className="text-[11px] text-ink-400">before tax & shipping</div>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2 md:w-52">
        <a
          className={clsx(ready ? 'btn-primary' : 'btn-secondary')}
          href={product.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => void onAction(item, 'opened_page', qty)}
        >
          <ExternalLink className="h-4 w-4" /> Open retailer page
        </a>
        <button className="btn-secondary btn-sm" disabled={busy !== null || qty === task.quantity} onClick={() => go('prepared')}>
          Save quantity ({qty})
        </button>
        <button className="btn-secondary btn-sm" disabled={busy !== null} onClick={() => go('checkout_ready')}>
          <BellPlus className="h-3.5 w-3.5" /> {available ? 'Send checkout alert' : 'Notify when available'}
        </button>
        <button className="btn-ghost btn-sm text-emerald-300 hover:text-emerald-200" disabled={busy !== null || !available} onClick={() => go('purchased')}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Mark {qty} as purchased
        </button>
      </div>
    </article>
  );
}
