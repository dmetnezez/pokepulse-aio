import type { DataSource, EventType, MonitoringTask, Product, TaskStatus } from '../types';
import { isAvailable } from '../types';
import { getStore } from '../store';
import { buildAlert, dispatchAlert } from '../notify';
import { IntegrationError, resolveAdapter, type CheckResult } from './adapters';

/** Routine "nothing changed" checks are sampled into stock_history at most this often per product. */
const CHECK_SAMPLE_MS = 5 * 60_000;
const MAX_BACKOFF_SEC = 30 * 60;
const NON_RETRYABLE_RECHECK_SEC = 10 * 60;

const g = globalThis as unknown as { __pokepulseLastSample?: Map<string, number> };
const lastSample = (g.__pokepulseLastSample ??= new Map());

const jitter = (sec: number) => Math.round(sec * 1000 * (0.9 + Math.random() * 0.2));

export interface CheckOutcome {
  ok: boolean;
  event?: EventType;
  result?: CheckResult;
  error?: string;
}

/**
 * Run one availability check for a product and fan the result out to every task that watches it.
 * Tasks on the same product + data source share a single upstream request — this is what keeps
 * hundreds of tasks cheap and keeps us well inside retailer rate limits.
 */
export async function checkProduct(product: Product, tasks: MonitoringTask[], source: DataSource): Promise<CheckOutcome> {
  const store = getStore();
  const now = new Date();
  const nowIso = now.toISOString();

  let result: CheckResult;
  try {
    const adapter = resolveAdapter(product.retailer_id, source);
    result = await adapter.check(product);
  } catch (err) {
    await handleFailure(tasks, err, now);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const wasAvailable = isAvailable(product.stock_status);
  const nowAvailable = isAvailable(result.status);
  const priceChanged = result.price != null && product.current_price != null && Math.abs(result.price - product.current_price) >= 0.01;

  let event: EventType = 'check';
  if (!wasAvailable && nowAvailable) event = 'restock';
  else if (wasAvailable && !nowAvailable) event = 'sold_out';
  else if (priceChanged) event = 'price_change';

  const patch: Partial<Product> = {
    stock_status: result.status,
    data_source: result.source,
    last_checked_at: nowIso,
  };
  if (result.price != null) {
    patch.current_price = result.price;
    if (priceChanged) patch.previous_price = product.current_price;
  }
  if (event === 'restock') patch.last_restock_at = nowIso;
  if (result.imageUrl && !product.image_url) patch.image_url = result.imageUrl;
  await store.updateProduct(product.id, patch);
  const updated: Product = { ...product, ...patch };

  const last = lastSample.get(product.id) ?? 0;
  if (event !== 'check' || now.getTime() - last >= CHECK_SAMPLE_MS) {
    lastSample.set(product.id, now.getTime());
    const row = await store.addStockHistory({
      product_id: product.id,
      retailer_id: product.retailer_id,
      price: updated.current_price,
      stock_status: result.status,
      in_stock: nowAvailable,
      event_type: event,
      data_source: result.source,
      latency_ms: result.latencyMs,
      checked_at: nowIso,
    });
    if (event !== 'check') {
      store.publish({ type: 'activity', event: { ...row, product_name: product.name, url: product.url } });
    }
  }

  await Promise.all(tasks.map((t) => applyResultToTask(t, updated, result, event, now)));
  return { ok: true, event, result };
}

async function applyResultToTask(task: MonitoringTask, product: Product, result: CheckResult, event: EventType, now: Date) {
  const store = getStore();
  const available = isAvailable(result.status);
  const priceOk = task.max_price == null || result.price == null || result.price <= task.max_price;

  let status: TaskStatus;
  if (available) status = priceOk ? 'restock_detected' : 'monitoring';
  else status = 'out_of_stock';

  const becameActionable = status === 'restock_detected' && task.status !== 'restock_detected';
  const patch: Partial<MonitoringTask> = {
    status,
    last_checked_at: now.toISOString(),
    next_check_at: new Date(now.getTime() + jitter(task.frequency_sec)).toISOString(),
    last_price: result.price ?? task.last_price,
    last_in_stock: available,
    check_count: task.check_count + 1,
    consecutive_errors: 0,
    error_message: null,
  };
  if (becameActionable) patch.restock_count = task.restock_count + 1;

  const saved = await store.updateTask(task.id, patch);
  if (saved) store.publish({ type: 'task', task: saved });

  const tag = result.source === 'simulated' ? '[simulated] ' : '';
  const price = result.price != null ? `$${result.price.toFixed(2)}` : 'unknown price';
  const log = async (level: 'info' | 'warn' | 'error' | 'debug', message: string, context: Record<string, unknown> = {}) => {
    const l = await store.addLog({ user_id: task.user_id, task_id: task.id, level, message, context });
    store.publish({ type: 'log', log: l });
  };

  if (task.consecutive_errors > 0) await log('info', `${tag}Recovered after ${task.consecutive_errors} failed check(s)`);
  if (becameActionable) {
    await log('info', `${tag}Restock detected at ${price} (${result.status.replace('_', ' ')}) in ${result.latencyMs} ms`, {
      price: result.price,
      latency_ms: result.latencyMs,
    });
    await dispatchAlert({ userId: task.user_id, task, productId: product.id, alert: buildAlert(task, product) });
  } else if (available && !priceOk && (event === 'restock' || event === 'price_change')) {
    await log('warn', `${tag}In stock at ${price}, above your max of $${task.max_price?.toFixed(2)} — no alert sent`);
  } else if (event === 'sold_out') {
    await log('info', `${tag}Sold out`);
  } else if (event === 'price_change') {
    await log('info', `${tag}Price changed to ${price}`);
  }
}

async function handleFailure(tasks: MonitoringTask[], err: unknown, now: Date) {
  const store = getStore();
  const ie = err instanceof IntegrationError ? err : new IntegrationError('UPSTREAM', err instanceof Error ? err.message : String(err));
  await Promise.all(
    tasks.map(async (task) => {
      const errors = task.consecutive_errors + 1;
      const backoffSec = ie.retryable
        ? Math.min(task.frequency_sec * 2 ** Math.min(errors - 1, 6), MAX_BACKOFF_SEC)
        : NON_RETRYABLE_RECHECK_SEC;
      const status: TaskStatus = !ie.retryable || errors >= 3 ? 'error' : task.status;
      const saved = await store.updateTask(task.id, {
        status,
        consecutive_errors: errors,
        error_message: `${ie.code}: ${ie.message}`,
        last_checked_at: now.toISOString(),
        next_check_at: new Date(now.getTime() + backoffSec * 1000).toISOString(),
      });
      if (saved) store.publish({ type: 'task', task: saved });
      const log = await store.addLog({
        user_id: task.user_id,
        task_id: task.id,
        level: ie.retryable && errors < 3 ? 'warn' : 'error',
        message: `${ie.message} — ${ie.retryable ? `retrying in ${backoffSec}s (attempt ${errors})` : `re-checking in ${backoffSec / 60} min`}`,
        context: { code: ie.code, consecutive_errors: errors },
      });
      store.publish({ type: 'log', log });
    }),
  );
}
