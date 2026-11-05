'use client';

import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, ExternalLink, PackageCheck, PackageX, Radio } from 'lucide-react';
import { useMemo } from 'react';
import { fmtPrice, fmtTime } from '@/lib/client';
import type { ActivityItem } from '@/lib/types';
import { useLive } from './LiveProvider';
import { EmptyState, RetailerTag, SourceBadge, StockBadge, TimeAgo } from './ui';

const EVENT = {
  restock: { label: 'Restock', icon: PackageCheck, cls: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/25' },
  sold_out: { label: 'Sold out', icon: PackageX, cls: 'text-ink-300 bg-ink-600/25 ring-ink-500/30' },
  price_change: { label: 'Price', icon: ArrowUpRight, cls: 'text-surge-300 bg-surge-500/10 ring-surge-500/25' },
  check: { label: 'Check', icon: Radio, cls: 'text-ink-300 bg-ink-700/30 ring-ink-600/30' },
};

/** Merges server-rendered recent activity with events streamed over SSE. */
export function ActivityFeed({ initial, limit = 30, watched }: { initial: ActivityItem[]; limit?: number; watched?: Set<string> }) {
  const { activity: live } = useLive();
  const items = useMemo(() => {
    const seen = new Set<number>();
    return [...live, ...initial]
      .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
      .sort((a, b) => b.checked_at.localeCompare(a.checked_at))
      .slice(0, limit);
  }, [live, initial, limit]);
  const liveIds = useMemo(() => new Set(live.map((l) => l.id)), [live]);

  if (!items.length)
    return (
      <EmptyState icon={<Radio className="h-5 w-5" />} title="Waiting for activity">
        Restocks, sell-outs and price changes appear here the moment they are detected.
      </EmptyState>
    );

  return (
    <ul className="divide-y divide-ink-700/60">
      {items.map((a) => {
        const e = EVENT[a.event_type];
        const Icon = a.event_type === 'price_change' && a.stock_status === 'out_of_stock' ? ArrowDownRight : e.icon;
        return (
          <li key={a.id} className={clsx('flex gap-3 px-5 py-3 transition', liveIds.has(a.id) && 'animate-slideIn bg-volt-500/[0.04]')}>
            <div className={clsx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset', e.cls)}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="group line-clamp-1 text-sm font-medium text-ink-100 hover:text-white">
                  {a.product_name}
                  <ExternalLink className="ml-1 inline h-3 w-3 text-ink-500 group-hover:text-ink-300" />
                </a>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-white">{fmtPrice(a.price)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <RetailerTag id={a.retailer_id} short />
                <StockBadge status={a.stock_status} />
                <SourceBadge source={a.data_source} compact />
                {watched?.has(a.product_id) && <span className="text-[10px] font-semibold uppercase tracking-wider text-volt-300">Your task</span>}
                <span className="ml-auto text-[11px] tabular-nums text-ink-400" title={new Date(a.checked_at).toLocaleString('en-CA')}>
                  {fmtTime(a.checked_at)} · <TimeAgo iso={a.checked_at} />
                  {a.latency_ms != null && a.event_type === 'restock' && <> · {a.latency_ms} ms</>}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
