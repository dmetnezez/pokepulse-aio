'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmtDateTime, fmtPrice } from '@/lib/client';
import type { StockHistoryRow } from '@/lib/types';

/* One accent hue for every single-series chart; reference marks are neutral; restock markers use the
   reserved "good" status green and are always labelled in the legend (never colour-only). */
export const C = {
  series: '#8b5cf6',
  grid: '#1f212b',
  axis: '#8a8ea3',
  ref: '#5c6075',
  good: '#0ca30c',
  surface: '#0e0f14',
};

const axisProps = {
  stroke: C.axis,
  tick: { fill: C.axis, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: C.grid },
} as const;

function TooltipBox({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-lg border border-ink-600 bg-ink-900/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <div className="mb-1 font-medium text-ink-100">{title}</div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 text-ink-300">
          <span>{k}</span>
          <span className="font-semibold tabular-nums text-ink-100">{v}</span>
        </div>
      ))}
    </div>
  );
}

export function LegendRow({ items }: { items: { label: string; swatch: 'line' | 'dot' | 'dash' | 'bar'; color: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-300">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.swatch === 'line' && <span className="h-0.5 w-4 rounded" style={{ background: i.color }} />}
          {i.swatch === 'dash' && <span className="w-4 border-t-2 border-dashed" style={{ borderColor: i.color }} />}
          {i.swatch === 'dot' && <span className="h-2.5 w-2.5 rounded-full" style={{ background: i.color }} />}
          {i.swatch === 'bar' && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />}
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Price over time (step line) with restock markers and the user's max-price reference. */
export function PriceChart({ history, maxPrice, height = 260 }: { history: StockHistoryRow[]; maxPrice?: number | null; height?: number }) {
  const rows = history
    .filter((h) => h.price != null)
    .map((h) => ({
      t: new Date(h.checked_at).getTime(),
      price: h.price,
      restock: h.event_type === 'restock' ? h.price : null,
      inStock: h.in_stock,
      event: h.event_type,
    }));
  if (rows.length < 2) return <div className="grid place-items-center text-sm text-ink-400" style={{ height }}>Not enough price history yet.</div>;
  const prices = rows.map((r) => r.price!).concat(maxPrice ? [maxPrice] : []);
  const lo = Math.floor(Math.min(...prices) * 0.95);
  const hi = Math.ceil(Math.max(...prices) * 1.05);
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            {...axisProps}
            tickFormatter={(t) => new Date(t).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
            minTickGap={40}
          />
          <YAxis {...axisProps} domain={[lo, hi]} width={56} tickFormatter={(v) => `$${v}`} />
          <Tooltip
            cursor={{ stroke: C.ref, strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof rows)[number];
              return (
                <TooltipBox
                  title={fmtDateTime(new Date(p.t).toISOString())}
                  rows={[
                    ['Price', fmtPrice(p.price)],
                    ['Stock', p.inStock ? 'In stock' : 'Sold out'],
                    ['Event', p.event.replace('_', ' ')],
                  ]}
                />
              );
            }}
          />
          {maxPrice != null && <ReferenceLine y={maxPrice} stroke={C.ref} strokeDasharray="5 4" strokeWidth={1.5} />}
          <Line type="stepAfter" dataKey="price" stroke={C.series} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: C.surface, strokeWidth: 2 }} isAnimationActive={false} />
          <Scatter dataKey="restock" fill={C.good} stroke={C.surface} strokeWidth={2} shape="circle" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <LegendRow
        items={[
          { label: 'Price (CAD)', swatch: 'line', color: C.series },
          { label: 'Restock detected', swatch: 'dot', color: C.good },
          ...(maxPrice != null ? [{ label: 'Your max price', swatch: 'dash' as const, color: C.ref }] : []),
        ]}
      />
    </div>
  );
}

/** Horizontal bar ranking (one series). */
export function BarRank({
  data,
  valueLabel,
  format = (v: number) => String(v),
  height,
}: {
  data: { name: string; value: number | null }[];
  valueLabel: string;
  format?: (v: number) => string;
  height?: number;
}) {
  const rows = data.map((d) => ({ ...d, value: d.value ?? 0, missing: d.value == null }));
  const h = height ?? Math.max(160, rows.length * 34 + 20);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }} barCategoryGap={8}>
        <CartesianGrid stroke={C.grid} horizontal={false} />
        <XAxis type="number" {...axisProps} tickFormatter={(v) => format(v)} />
        <YAxis
          type="category"
          dataKey="name"
          {...axisProps}
          axisLine={false}
          width={190}
          tick={{ fill: '#b4b7c7', fontSize: 11 }}
          tickFormatter={(s: string) => (s.length > 30 ? s.slice(0, 29) + '…' : s)}
        />
        <Tooltip
          cursor={{ fill: 'rgba(139,92,246,0.08)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as (typeof rows)[number];
            return <TooltipBox title={p.name} rows={[[valueLabel, p.missing ? 'not enough data' : format(p.value)]]} />;
          }}
        />
        <Bar
          dataKey="value"
          fill={C.series}
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
          isAnimationActive={false}
          label={{ position: 'right', fill: '#b4b7c7', fontSize: 11, formatter: (v: number) => (v ? format(v) : '') }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Vertical bars over time (one series). */
export function TimelineBars({ data, valueLabel, height = 220 }: { data: { date: string; value: number }[]; valueLabel: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis
          dataKey="date"
          {...axisProps}
          minTickGap={24}
          tickFormatter={(d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
        />
        <YAxis {...axisProps} allowDecimals={false} width={32} />
        <Tooltip
          cursor={{ fill: 'rgba(139,92,246,0.08)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { date: string; value: number };
            return (
              <TooltipBox
                title={new Date(p.date + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}
                rows={[[valueLabel, String(p.value)]]}
              />
            );
          }}
        />
        <Bar dataKey="value" fill={C.series} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
