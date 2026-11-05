import type { ActivityItem, Product, RetailerId, StockHistoryRow, TaskStatus } from '../types';
import { isAvailable } from '../types';
import { RETAILERS } from '../retailers';
import { getStore } from '../store';
import { liveIntegrationStatus } from '../monitor/adapters';

/** Midnight in Toronto (Eastern time), the reference "today" for a Canadian restock dashboard. */
export function startOfTodayEastern(now = new Date()): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const elapsed = ((Number(parts.hour) % 24) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - elapsed);
}

export function toActivity(rows: StockHistoryRow[], products: Map<string, Product>): ActivityItem[] {
  return rows.map((h) => {
    const p = products.get(h.product_id);
    return { ...h, product_name: p?.name ?? 'Unknown product', url: p?.url ?? '' };
  });
}

export async function dashboardStats(userId: string) {
  const store = getStore();
  const [tasks, products, purchases] = await Promise.all([
    store.listTasks(userId),
    store.listProducts(),
    store.listPurchaseActivity(userId, 1000),
  ]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const today = startOfTodayEastern().toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [todayEvents, weekRestocks, recent] = await Promise.all([
    store.listStockHistory({ since: today, eventTypes: ['restock'], limit: 5000 }),
    store.listStockHistory({ since: weekAgo, eventTypes: ['restock'], limit: 5000 }),
    store.listStockHistory({ eventTypes: ['restock', 'sold_out', 'price_change'], limit: 40 }),
  ]);

  const myProducts = new Set(tasks.map((t) => t.product_id));
  const statusCounts = tasks.reduce(
    (acc, t) => ({ ...acc, [t.status]: (acc[t.status] ?? 0) + 1 }),
    {} as Partial<Record<TaskStatus, number>>,
  );
  const latencies = weekRestocks.map((r) => r.latency_ms).filter((n): n is number => n != null);

  return {
    activeTasks: tasks.filter((t) => t.is_active).length,
    totalTasks: tasks.length,
    statusCounts,
    inStock: products.filter((p) => isAvailable(p.stock_status)).length,
    inStockWatched: products.filter((p) => myProducts.has(p.id) && isAvailable(p.stock_status)).length,
    totalProducts: products.length,
    restocksToday: todayEvents.length,
    restocksTodayWatched: todayEvents.filter((e) => myProducts.has(e.product_id)).length,
    successfulPurchases: purchases.filter((p) => p.action === 'purchased').reduce((n, p) => n + p.quantity, 0),
    avgDetectionMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
    recentActivity: toActivity(recent, byId),
    simulatedShare: products.length ? products.filter((p) => p.data_source === 'simulated').length / products.length : 1,
  };
}

export function systemInfo() {
  return {
    store: getStore().kind,
    workerMode: process.env.WORKER_MODE === 'external' ? 'external' : 'embedded',
    integrations: liveIntegrationStatus(),
  };
}

export async function analytics(days: number) {
  const store = getStore();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [products, history] = await Promise.all([store.listProducts(), store.listStockHistory({ since, limit: 200_000, desc: false })]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const restocks = history.filter((h) => h.event_type === 'restock');

  // Restocks by retailer
  const byRetailer = RETAILERS.map((r) => ({
    retailer: r.id,
    name: r.name,
    color: r.brand_color,
    restocks: restocks.filter((h) => h.retailer_id === r.id).length,
  }));

  // Most frequently restocked products (grouped across retailers by product name)
  const productCounts = new Map<string, number>();
  for (const h of restocks) {
    const name = byId.get(h.product_id)?.name;
    if (name) productCounts.set(name, (productCounts.get(name) ?? 0) + 1);
  }
  const topProducts = [...productCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  // Average hours between restocks, per retailer
  const restockTimes = new Map<string, number[]>();
  for (const h of restocks) {
    const arr = restockTimes.get(h.product_id) ?? [];
    arr.push(new Date(h.checked_at).getTime());
    restockTimes.set(h.product_id, arr);
  }
  const gapsByRetailer = new Map<RetailerId, number[]>();
  for (const [pid, times] of restockTimes) {
    const p = byId.get(pid);
    if (!p || times.length < 2) continue;
    times.sort((a, b) => a - b);
    const arr = gapsByRetailer.get(p.retailer_id) ?? [];
    for (let i = 1; i < times.length; i++) arr.push((times[i] - times[i - 1]) / 3_600_000);
    gapsByRetailer.set(p.retailer_id, arr);
  }
  const timeBetween = RETAILERS.map((r) => {
    const gaps = gapsByRetailer.get(r.id) ?? [];
    return {
      retailer: r.id,
      name: r.name,
      color: r.brand_color,
      avgHours: gaps.length ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10 : null,
      samples: gaps.length,
    };
  });

  // Availability: share of observations where the listing was in stock
  const availability = RETAILERS.map((r) => {
    const rows = history.filter((h) => h.retailer_id === r.id);
    const inStock = rows.filter((h) => h.in_stock).length;
    return {
      retailer: r.id,
      name: r.name,
      color: r.brand_color,
      pct: rows.length ? Math.round((inStock / rows.length) * 1000) / 10 : 0,
      observations: rows.length,
      listings: products.filter((p) => p.retailer_id === r.id).length,
    };
  });

  // Daily restocks per retailer
  const dayKey = (iso: string) => iso.slice(0, 10);
  const daily = new Map<string, Record<string, number>>();
  for (let d = 0; d <= days; d++) {
    const key = dayKey(new Date(Date.now() - (days - d) * 86_400_000).toISOString());
    daily.set(key, Object.fromEntries(RETAILERS.map((r) => [r.id, 0])));
  }
  for (const h of restocks) {
    const row = daily.get(dayKey(h.checked_at));
    if (row) row[h.retailer_id] = (row[h.retailer_id] ?? 0) + 1;
  }
  const timeline = [...daily.entries()].map(([date, counts]) => ({ date, ...counts }));

  // Products ranked for the price-history picker
  // (listings with the most price movement first, so the default chart is informative)
  const restockCountByProduct = new Map<string, number>();
  const priceMoves = new Map<string, number>();
  for (const h of restocks) restockCountByProduct.set(h.product_id, (restockCountByProduct.get(h.product_id) ?? 0) + 1);
  for (const h of history) if (h.event_type === 'price_change') priceMoves.set(h.product_id, (priceMoves.get(h.product_id) ?? 0) + 1);
  const priceCandidates = products
    .map((p) => ({ id: p.id, name: p.name, retailer_id: p.retailer_id, restocks: restockCountByProduct.get(p.id) ?? 0, priceChanges: priceMoves.get(p.id) ?? 0 }))
    .sort((a, b) => b.priceChanges - a.priceChanges || b.restocks - a.restocks);

  return {
    days,
    totals: {
      restocks: restocks.length,
      observations: history.length,
      simulatedShare: history.length ? history.filter((h) => h.data_source === 'simulated').length / history.length : 1,
    },
    byRetailer,
    topProducts,
    timeBetween,
    availability,
    timeline,
    priceCandidates,
  };
}
