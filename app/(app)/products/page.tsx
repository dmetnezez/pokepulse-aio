'use client';

import clsx from 'clsx';
import { ArrowDown, ArrowUp, Boxes, ExternalLink, Eye, Radar, Search, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { PriceChart } from '@/components/charts';
import { useToast } from '@/components/LiveProvider';
import { ProductArt } from '@/components/ProductArt';
import { TaskForm } from '@/components/TaskForm';
import { Drawer, EmptyState, ErrorBlock, LoadingBlock, PageHeader, RetailerTag, SourceBadge, StockBadge, TimeAgo } from '@/components/ui';
import { api, fmtPrice } from '@/lib/client';
import { RETAILERS } from '@/lib/retailers';
import { CATEGORIES, CATEGORY_LABELS, type Product, type StockHistoryRow } from '@/lib/types';

type Row = Product & { favourite: boolean; watched: boolean };

export default function ProductsPage() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState('');
  const [retailer, setRetailer] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('restock');
  const [favs, setFavs] = useState(false);
  const [monitor, setMonitor] = useState<Product | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  const params = new URLSearchParams({ q: debounced, category, retailer, status, sort, favourites: favs ? '1' : '' });
  const key = `/api/products?${params}`;
  const { data, error, mutate } = useSWR<{ products: Row[]; total: number }>(key, { refreshInterval: 20_000 });

  const toggleFav = async (p: Row) => {
    await mutate(
      async (cur) => {
        await api(`/api/products/${p.id}/favourite`, { method: 'POST', json: { favourite: !p.favourite } });
        return cur && { ...cur, products: cur.products.map((x) => (x.id === p.id ? { ...x, favourite: !p.favourite } : x)) };
      },
      { revalidate: favs },
    ).catch((err) => toast({ kind: 'error', title: (err as Error).message }));
  };

  return (
    <>
      <PageHeader title="Products" subtitle={data ? `${data.products.length} of ${data.total} listings across Canadian retailers` : 'Product catalogue'} />

      <div className="mb-4 flex flex-wrap gap-2">
        <Chip active={!category} onClick={() => setCategory('')}>
          All
        </Chip>
        {CATEGORIES.map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
            {CATEGORY_LABELS[c]}
          </Chip>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-400" />
          <input className="input pl-8" placeholder="Search products or sets…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input w-48" value={retailer} onChange={(e) => setRetailer(e.target.value)} aria-label="Retailer">
          <option value="">All retailers</option>
          {RETAILERS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Stock">
          <option value="">Any stock</option>
          <option value="in_stock">In stock</option>
          <option value="out_of_stock">Unavailable</option>
        </select>
        <select className="input w-48" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="restock">Recently restocked</option>
          <option value="stock">In stock first</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="name">Name</option>
        </select>
        <button className={clsx('btn-secondary', favs && 'border-amber-500/50 text-amber-300')} onClick={() => setFavs((f) => !f)}>
          <Star className={clsx('h-4 w-4', favs && 'fill-amber-300')} /> Favourites
        </button>
      </div>

      {error ? (
        <ErrorBlock error={error} retry={() => mutate()} />
      ) : !data ? (
        <LoadingBlock label="Loading catalogue…" />
      ) : data.products.length === 0 ? (
        <div className="panel">
          <EmptyState icon={<Boxes className="h-5 w-5" />} title="No products match">
            {favs ? 'Star products to add them to your favourites.' : 'Try clearing a filter.'}
          </EmptyState>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {data.products.map((p) => (
            <ProductCard key={p.id} p={p} onFav={() => toggleFav(p)} onMonitor={() => setMonitor(p)} onDetail={() => setDetail(p)} />
          ))}
        </div>
      )}

      <TaskForm open={Boolean(monitor)} product={monitor} onClose={() => setMonitor(null)} onSaved={() => mutate()} />
      <Drawer open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.name}>
        {detail && <ProductDetail product={detail} onMonitor={() => setMonitor(detail)} />}
      </Drawer>
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'rounded-full border px-3 py-1 text-xs font-medium transition',
        active ? 'border-volt-500/60 bg-volt-500/15 text-white' : 'border-ink-700 text-ink-300 hover:border-ink-500 hover:text-ink-100',
      )}
    >
      {children}
    </button>
  );
}

function PriceDelta({ current, previous }: { current: number | null; previous: number | null }) {
  if (current == null || previous == null || Math.abs(current - previous) < 0.01) return null;
  const up = current > previous;
  return (
    <span className={clsx('inline-flex items-center text-xs font-medium tabular-nums', up ? 'text-red-300' : 'text-emerald-300')} title={`Previously ${fmtPrice(previous)}`}>
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {fmtPrice(Math.abs(current - previous))}
    </span>
  );
}

function ProductCard({ p, onFav, onMonitor, onDetail }: { p: Row; onFav: () => void; onMonitor: () => void; onDetail: () => void }) {
  return (
    <article className="panel group flex flex-col overflow-hidden transition hover:border-ink-500">
      <div className="relative">
        <button onClick={onDetail} className="block w-full" aria-label={`View ${p.name}`}>
          <ProductArt name={p.name} setName={p.set_name} category={p.category} imageUrl={p.image_url} className="aspect-[4/3] w-full" />
        </button>
        <div className="absolute left-3 top-3 flex gap-1.5">
          <StockBadge status={p.stock_status} />
          <SourceBadge source={p.data_source} compact />
        </div>
        <button
          onClick={onFav}
          aria-label={p.favourite ? 'Remove from favourites' : 'Add to favourites'}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/50 backdrop-blur transition hover:bg-black/70"
        >
          <Star className={clsx('h-4 w-4', p.favourite ? 'fill-amber-300 text-amber-300' : 'text-ink-200')} />
        </button>
        {p.watched && (
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-md bg-volt-600/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            <Radar className="h-3 w-3" /> Monitoring
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-ink-400">
          {CATEGORY_LABELS[p.category]} {p.language === 'JP' && '· JP'}
        </div>
        <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-ink-100">{p.name}</h3>
        <div className="mt-2">
          <RetailerTag id={p.retailer_id} />
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-xl font-semibold tabular-nums text-white">{fmtPrice(p.current_price)}</span>
          <PriceDelta current={p.current_price} previous={p.previous_price} />
          {p.previous_price != null && Math.abs((p.current_price ?? 0) - p.previous_price) >= 0.01 && (
            <span className="text-xs tabular-nums text-ink-500 line-through">{fmtPrice(p.previous_price)}</span>
          )}
        </div>
        <div className="mt-1 text-xs text-ink-400">
          Last restock: <TimeAgo iso={p.last_restock_at} />
        </div>
        <div className="mt-auto flex gap-2 pt-4">
          <button className="btn-primary btn-sm flex-1" onClick={onMonitor}>
            <Radar className="h-3.5 w-3.5" /> Monitor
          </button>
          <button className="btn-secondary btn-sm" onClick={onDetail} title="Price history">
            <Eye className="h-3.5 w-3.5" />
          </button>
          <a className="btn-secondary btn-sm" href={p.url} target="_blank" rel="noopener noreferrer" title="Open retailer page">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </article>
  );
}

function ProductDetail({ product, onMonitor }: { product: Row; onMonitor: () => void }) {
  const { data, error } = useSWR<{ product: Product; history: StockHistoryRow[] }>(`/api/products/${product.id}?days=30`);
  const p = data?.product ?? product;
  const restocks = data?.history.filter((h) => h.event_type === 'restock').length ?? 0;
  return (
    <div className="space-y-5">
      <ProductArt name={p.name} setName={p.set_name} category={p.category} imageUrl={p.image_url} className="aspect-[16/7] w-full rounded-xl" />
      <div className="flex flex-wrap items-center gap-3">
        <RetailerTag id={p.retailer_id} />
        <StockBadge status={p.stock_status} />
        <SourceBadge source={p.data_source} />
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <Info label="Current price" value={fmtPrice(p.current_price)} />
        <Info label="Previous price" value={fmtPrice(p.previous_price)} />
        <Info label="MSRP" value={fmtPrice(p.msrp)} />
        <Info label="Restocks (30d)" value={String(restocks)} />
      </div>
      <div className="rounded-xl border border-ink-700 bg-ink-850 p-3">
        <div className="mb-2 text-sm font-semibold text-ink-100">Price history · 30 days</div>
        {error ? <p className="text-sm text-red-300">{error.message}</p> : data ? <PriceChart history={data.history} /> : <LoadingBlock />}
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" onClick={onMonitor}>
          <Radar className="h-4 w-4" /> Create monitoring task
        </button>
        <a className="btn-secondary" href={p.url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-4 w-4" /> Open on retailer site
        </a>
      </div>
      <p className="text-xs text-ink-400">
        Sample catalogue links open the retailer’s own search page for this product. Paste a direct product URL when creating a task for exact tracking.
      </p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
      <div className="text-[11px] text-ink-400">{label}</div>
      <div className="mt-0.5 font-medium tabular-nums text-ink-100">{value}</div>
    </div>
  );
}
