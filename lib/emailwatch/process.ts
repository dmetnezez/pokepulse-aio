import type { Channel, MonitoringTask, NotificationRow, UserSettings } from '../types';
import { getStore } from '../store';
import { dispatchAlert, type Alert } from '../notify';
import { htmlToText, matchTasks, parseDropEmail, type DropSignal, type IncomingEmail } from './parse';

export interface ProcessResult {
  signal: DropSignal;
  matchedTasks: { id: string; product_name: string }[];
  notifications: NotificationRow[];
}

/** Never forward to email — that would land back in the inbox we are watching. */
const SAFE_CHANNELS = (t: Pick<MonitoringTask, 'notify_discord' | 'notify_browser' | 'notify_telegram'> | null): Channel[] =>
  t ? ([t.notify_discord && 'discord', t.notify_browser && 'browser', t.notify_telegram && 'telegram'].filter(Boolean) as Channel[]) : ['discord', 'browser', 'telegram'];

/**
 * Turn one incoming email into alerts. Matching Pokémon Center tasks are flipped to "restock detected"
 * and their products marked in stock (source: email); otherwise a general drop alert is sent.
 */
export async function processDropEmail(userId: string, email: IncomingEmail, settings: UserSettings): Promise<ProcessResult> {
  const store = getStore();
  const signal = parseDropEmail(email, { senders: settings.email_watch_senders, keywords: settings.email_watch_keywords });
  const log = async (level: 'info' | 'warn', message: string, taskId: string | null = null, context: Record<string, unknown> = {}) => {
    const l = await store.addLog({ user_id: userId, task_id: taskId, level, message, context });
    store.publish({ type: 'log', log: l });
  };

  if (!signal.matched) {
    await log('info', `Inbox: ignored "${email.subject.slice(0, 80)}" — ${signal.reason}`);
    return { signal, matchedTasks: [], notifications: [] };
  }

  const now = new Date();
  const receivedAt = email.date ? new Date(email.date) : now;
  const latency = Math.max(0, now.getTime() - receivedAt.getTime());
  const text = email.text?.trim() ? email.text : htmlToText(email.html ?? '');
  const tasks = (await store.listTasks(userId)).filter((t) => t.is_active && t.retailer_id === 'pokemon-center-ca');
  const matched = matchTasks(signal, text, tasks);
  const notifications: NotificationRow[] = [];

  for (const task of matched) {
    const product = await store.getProduct(task.product_id);
    if (!product) continue;
    const productPatch = {
      stock_status: 'in_stock' as const,
      data_source: 'email' as const,
      last_restock_at: now.toISOString(),
      last_checked_at: now.toISOString(),
    };
    await store.updateProduct(product.id, productPatch);
    const row = await store.addStockHistory({
      product_id: product.id,
      retailer_id: product.retailer_id,
      price: product.current_price,
      stock_status: 'in_stock',
      in_stock: true,
      event_type: 'restock',
      data_source: 'email',
      latency_ms: latency,
      checked_at: now.toISOString(),
    });
    store.publish({ type: 'activity', event: { ...row, product_name: product.name, url: product.url } });
    const saved = await store.updateTask(task.id, {
      status: 'restock_detected',
      last_in_stock: true,
      restock_count: task.restock_count + (task.status === 'restock_detected' ? 0 : 1),
      last_checked_at: now.toISOString(),
    });
    if (saved) store.publish({ type: 'task', task: saved });

    const alert: Alert = {
      title: `Pokémon Center email: ${product.name}`,
      productName: product.name,
      retailer: 'Pokémon Center Canada',
      price: null, // the email doesn't carry a verified price; don't show a simulated one
      maxPrice: task.max_price,
      quantity: task.quantity,
      status: 'in_stock',
      url: signal.url !== product.url && signal.url.includes('/product/') ? signal.url : product.url,
      source: 'email',
      detectedAt: now.toISOString(),
    };
    notifications.push(...(await dispatchAlert({ userId, task, productId: product.id, alert, channels: SAFE_CHANNELS(task) })));
    await log('info', `Inbox: Pokémon Center email "${email.subject.slice(0, 80)}" matched this task — alert sent`, task.id, { url: signal.url });
  }

  if (!matched.length) {
    const alert: Alert = {
      title: `Pokémon Center email: ${email.subject.slice(0, 180)}`,
      productName: email.subject,
      retailer: 'Pokémon Center Canada',
      price: null,
      maxPrice: null,
      quantity: 1,
      status: 'in_stock',
      url: signal.url,
      source: 'email',
      detectedAt: now.toISOString(),
    };
    notifications.push(...(await dispatchAlert({ userId, task: null, productId: null, alert, channels: SAFE_CHANNELS(null) })));
    await log('info', `Inbox: Pokémon Center email "${email.subject.slice(0, 80)}" — drop alert sent`, null, { url: signal.url });
  }

  return { signal, matchedTasks: matched.map((t) => ({ id: t.id, product_name: t.product_name })), notifications };
}
