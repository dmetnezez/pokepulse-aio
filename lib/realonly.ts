import type { MonitoringTask, Product, StockHistoryRow } from './types';

/**
 * "Real data only" view: strips everything the simulator produced so the UI shows only data that came
 * from a real source (a retailer email or an authorized API). Pure helpers, applied server-side.
 */

export type TaskWatch = 'email' | 'api' | 'none';

export const isReal = (x: { data_source: string }) => x.data_source !== 'simulated';

export function maskProduct<P extends Product>(p: P): P {
  if (isReal(p)) return p;
  return { ...p, stock_status: 'unknown', current_price: null, previous_price: null, last_restock_at: null, last_checked_at: null };
}

export function realHistory(rows: StockHistoryRow[]): StockHistoryRow[] {
  return rows.filter(isReal);
}

/** How a task gets real data in real-only mode. */
export function taskWatch(t: MonitoringTask): TaskWatch {
  if (t.data_source === 'live') return 'api';
  return t.retailer_id === 'pokemon-center-ca' ? 'email' : 'none';
}

/**
 * One-time cleanup when a user switches real-only on: wipe simulator-produced status, counters, prices
 * and timestamps from their tasks so nothing simulated lingers (email-confirmed state starts clean too).
 */
export function realOnlyResetPatch(t: MonitoringTask, productIsSimulated: boolean): Partial<MonitoringTask> | null {
  if (t.data_source === 'live') return productIsSimulated ? { last_price: null } : null;
  return {
    status: t.is_active ? 'monitoring' : 'paused',
    restock_count: 0,
    check_count: 0,
    last_price: null,
    last_in_stock: null,
    last_checked_at: null,
    consecutive_errors: 0,
    error_message: null,
  };
}

export function maskTask(t: MonitoringTask): MonitoringTask & { watch: TaskWatch } {
  const watch = taskWatch(t);
  if (watch === 'api') return { ...t, watch };
  // Simulated tasks: keep only what a real email set (restock_detected); drop simulated price/stock/counters.
  // Only an email can have set "restock detected" on an email-watched task; anything else came from the simulator.
  const status = t.status === 'paused' || (watch === 'email' && t.status === 'restock_detected') ? t.status : 'monitoring';
  return {
    ...t,
    watch,
    status,
    last_price: null,
    last_in_stock: status === 'restock_detected' ? true : null,
    check_count: 0,
    restock_count: watch === 'email' ? t.restock_count : 0,
    last_checked_at: watch === 'email' ? t.last_checked_at : null,
    error_message: null,
    consecutive_errors: 0,
  };
}
