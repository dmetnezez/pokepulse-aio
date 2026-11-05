'use client';

import clsx from 'clsx';
import { Table2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { BarRank, PriceChart, TimelineBars } from '@/components/charts';
import { ErrorBlock, LoadingBlock, PageHeader, Panel, SimulatedBanner, StatCard } from '@/components/ui';
import { retailerName } from '@/lib/retailers';
import type { Product, RetailerId, StockHistoryRow } from '@/lib/types';
import { Activity, Clock, Eye, Store } from 'lucide-react';

interface Analytics {
  days: number;
  totals: { restocks: number; observations: number; simulatedShare: number };
  byRetailer: { retailer: RetailerId; name: string; restocks: number }[];
  topProducts: { name: string; count: number }[];
  timeBetween: { retailer: RetailerId; name: string; avgHours: number | null; samples: number }[];
  availability: { retailer: RetailerId; name: string; pct: number; observations: number; listings: number }[];
  timeline: ({ date: string } & Record<string, number | string>)[];
  priceCandidates: { id: string; name: string; retailer_id: RetailerId; restocks: number }[];
}

const RANGES = [7, 14, 30, 60, 90];
const short = (n: string) => n.replace(' Canada', '');

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [tables, setTables] = useState(false);
  const { data, error, mutate } = useSWR<Analytics>(`/api/analytics?days=${days}`, { refreshInterval: 60_000 });
  const [productId, setProductId] = useState('');
  useEffect(() => {
    if (data && !productId && data.priceCandidates[0]) setProductId(data.priceCandidates[0].id);
  }, [data, productId]);
  const { data: priceData } = useSWR<{ product: Product; history: StockHistoryRow[] }>(productId ? `/api/products/${productId}?days=${days}` : null);

  if (error) return <ErrorBlock error={error} retry={() => mutate()} />;
  if (!data) return <LoadingBlock label="Crunching stock history…" />;

  const timeline = data.timeline.map((d) => ({
    date: d.date,
    value: Object.entries(d).reduce((s, [k, v]) => (k === 'date' ? s : s + Number(v)), 0),
  }));
  const busiest = [...data.byRetailer].sort((a, b) => b.restocks - a.restocks)[0];
  const fastest = data.timeBetween.filter((t) => t.avgHours != null).sort((a, b) => a.avgHours! - b.avgHours!)[0];
  const bestAvail = [...data.availability].sort((a, b) => b.pct - a.pct)[0];

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Restock patterns and price movement across Canadian retailers"
        actions={
          <>
            <div className="inline-flex rounded-lg border border-ink-600 bg-ink-900 p-0.5 text-sm">
              {RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setDays(r)}
                  className={clsx('rounded-md px-3 py-1.5 font-medium transition', days === r ? 'bg-ink-700 text-white' : 'text-ink-300 hover:text-ink-100')}
                >
                  {r}d
                </button>
              ))}
            </div>
            <button className={clsx('btn-secondary', tables && 'border-volt-500/60')} onClick={() => setTables((t) => !t)}>
              <Table2 className="h-4 w-4" /> {tables ? 'Show charts' : 'Show tables'}
            </button>
          </>
        }
      />
      <SimulatedBanner share={data.totals.simulatedShare} />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label={`Restocks · ${days}d`} value={data.totals.restocks} sub={`${data.totals.observations.toLocaleString()} stock observations`} icon={<Activity className="h-4 w-4" />} />
        <StatCard label="Busiest retailer" value={short(busiest?.name ?? '—')} sub={`${busiest?.restocks ?? 0} restocks`} icon={<Store className="h-4 w-4" />} accent="surge" />
        <StatCard label="Shortest restock gap" value={fastest ? `${fastest.avgHours}h` : '—'} sub={fastest ? short(fastest.name) : 'not enough data'} icon={<Clock className="h-4 w-4" />} accent="amber" />
        <StatCard label="Best availability" value={`${bestAvail?.pct ?? 0}%`} sub={short(bestAvail?.name ?? '—')} icon={<Eye className="h-4 w-4" />} accent="emerald" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Restocks per day">
          {tables ? (
            <DataTable cols={['Date', 'Restocks']} rows={timeline.map((t) => [t.date, t.value])} />
          ) : (
            <TimelineBars data={timeline} valueLabel="Restocks" />
          )}
        </Panel>

        <Panel title="Restocks by retailer">
          {tables ? (
            <DataTable cols={['Retailer', 'Restocks']} rows={data.byRetailer.map((r) => [r.name, r.restocks])} />
          ) : (
            <BarRank data={data.byRetailer.map((r) => ({ name: short(r.name), value: r.restocks }))} valueLabel="Restocks" />
          )}
        </Panel>

        <Panel title="Most frequently restocked products">
          {tables ? (
            <DataTable cols={['Product', 'Restocks']} rows={data.topProducts.map((p) => [p.name, p.count])} />
          ) : data.topProducts.length ? (
            <BarRank data={data.topProducts.map((p) => ({ name: p.name, value: p.count }))} valueLabel="Restocks (all retailers)" />
          ) : (
            <p className="text-sm text-ink-400">No restocks in this window.</p>
          )}
        </Panel>

        <Panel title="Average time between restocks">
          {tables ? (
            <DataTable cols={['Retailer', 'Avg hours', 'Gaps measured']} rows={data.timeBetween.map((t) => [t.name, t.avgHours ?? '—', t.samples])} />
          ) : (
            <>
              <BarRank
                data={data.timeBetween.map((t) => ({ name: short(t.name), value: t.avgHours }))}
                valueLabel="Avg hours between restocks"
                format={(v) => `${v}h`}
              />
              <p className="mt-2 text-xs text-ink-400">Per listing, averaged by retailer. Lower means restocks come back faster.</p>
            </>
          )}
        </Panel>

        <Panel title="Retailer availability comparison">
          {tables ? (
            <DataTable cols={['Retailer', '% observed in stock', 'Observations', 'Listings']} rows={data.availability.map((a) => [a.name, `${a.pct}%`, a.observations, a.listings])} />
          ) : (
            <>
              <BarRank data={data.availability.map((a) => ({ name: short(a.name), value: a.pct }))} valueLabel="Observed in stock" format={(v) => `${v}%`} />
              <p className="mt-2 text-xs text-ink-400">Share of stock observations where the listing was available.</p>
            </>
          )}
        </Panel>

        <Panel
          title="Historical price movement"
          action={
            <select className="input max-w-[300px] py-1 text-xs" value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Product">
              {data.priceCandidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {short(retailerName(p.retailer_id))}
                </option>
              ))}
            </select>
          }
        >
          {!priceData ? (
            <LoadingBlock />
          ) : tables ? (
            <DataTable
              cols={['Time', 'Event', 'Price', 'In stock']}
              rows={priceData.history
                .filter((h) => h.event_type !== 'check')
                .map((h) => [new Date(h.checked_at).toLocaleString('en-CA'), h.event_type.replace('_', ' '), h.price ?? '—', h.in_stock ? 'yes' : 'no'])}
            />
          ) : (
            <PriceChart history={priceData.history} height={240} />
          )}
        </Panel>
      </div>
    </>
  );
}

function DataTable({ cols, rows }: { cols: string[]; rows: (string | number)[][] }) {
  return (
    <div className="max-h-[320px] overflow-auto">
      <table className="w-full text-sm">
        <thead className="table-head sticky top-0 bg-ink-850">
          <tr>
            {cols.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-700/50">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j} className={clsx('px-4 py-1.5 text-ink-200', j > 0 && 'tabular-nums')}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
