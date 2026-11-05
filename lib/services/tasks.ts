import type { MonitoringTask, Product } from '../types';
import { detectRetailer, extractAsin, RETAILER_MAP } from '../retailers';
import { getStore } from '../store';
import { HttpError } from '../http';
import type { TaskInput } from '../validation';
import { taskPatchSchema } from '../validation';
import type { z } from 'zod';

export const MAX_TASKS_PER_USER = 500;

export async function getOwnedTask(userId: string, id: string): Promise<MonitoringTask> {
  const task = await getStore().getTask(id);
  if (!task || task.user_id !== userId) throw new HttpError(404, 'Task not found');
  return task;
}

/** Find or create the catalogue product a task points at. */
async function resolveProduct(input: TaskInput): Promise<Product> {
  const store = getStore();
  if (input.product_id) {
    const p = await store.getProduct(input.product_id);
    if (!p) throw new HttpError(404, 'Product not found');
    return p;
  }
  const url = input.product_url!;
  const detected = detectRetailer(url);
  if (!detected && !input.retailer_id)
    throw new HttpError(400, 'Unrecognised retailer URL — supported: Pokémon Center, Walmart, Best Buy, GameStop, Toys R Us, Costco and Amazon (Canada)');
  if (detected && input.retailer_id && detected !== input.retailer_id)
    throw new HttpError(400, `That URL belongs to ${RETAILER_MAP[detected].name}, not ${RETAILER_MAP[input.retailer_id].name}`);
  const retailer = detected ?? input.retailer_id!;

  const existing = await store.findProductByUrl(url);
  if (existing) return existing;
  return store.createProduct({
    name: input.product_name!,
    category: input.category,
    set_name: '',
    language: input.category === 'japanese' ? 'JP' : 'EN',
    retailer_id: retailer,
    url,
    external_id: retailer === 'amazon-ca' ? extractAsin(url) : null,
    image_url: null,
    msrp: input.max_price ?? null,
    current_price: null,
    previous_price: null,
    stock_status: 'unknown',
    data_source: input.data_source,
    last_restock_at: null,
    last_checked_at: null,
  });
}

export async function createTask(userId: string, input: TaskInput): Promise<{ task: MonitoringTask; warnings: string[] }> {
  const store = getStore();
  const existing = await store.listTasks(userId);
  if (existing.length >= MAX_TASKS_PER_USER) throw new HttpError(400, `Task limit reached (${MAX_TASKS_PER_USER})`);

  const product = await resolveProduct(input);
  const retailer = RETAILER_MAP[product.retailer_id];
  const warnings: string[] = [];
  let frequency = input.frequency_sec;
  if (frequency < retailer.min_interval_sec) {
    warnings.push(`Frequency raised to ${retailer.min_interval_sec}s to respect ${retailer.name}'s rate limit`);
    frequency = retailer.min_interval_sec;
  }
  if (input.data_source === 'live' && retailer.integration_status === 'not_available')
    warnings.push(`${retailer.name} has no authorized live integration yet — this task will report an error until you switch it to simulated data`);

  const task = await store.createTask({
    user_id: userId,
    product_id: product.id,
    product_name: input.product_name ?? product.name,
    product_url: product.url,
    retailer_id: product.retailer_id,
    max_price: input.max_price ?? null,
    quantity: input.quantity,
    frequency_sec: frequency,
    data_source: input.data_source,
    notify_discord: input.notify_discord,
    notify_browser: input.notify_browser,
    notify_email: input.notify_email,
    notify_telegram: input.notify_telegram,
    is_active: input.is_active,
    status: input.is_active ? 'monitoring' : 'paused',
    last_checked_at: null,
    next_check_at: new Date().toISOString(),
    last_price: product.current_price,
    last_in_stock: null,
    check_count: 0,
    restock_count: 0,
    consecutive_errors: 0,
    error_message: null,
  });
  await store.addLog({
    user_id: userId,
    task_id: task.id,
    level: 'info',
    message: `Task created — checking ${retailer.name} every ${frequency}s (${input.data_source} data)`,
    context: {},
  });
  store.publish({ type: 'task', task });
  return { task, warnings };
}

export async function updateTask(userId: string, id: string, patch: z.infer<typeof taskPatchSchema>) {
  const store = getStore();
  const task = await getOwnedTask(userId, id);
  const retailer = RETAILER_MAP[task.retailer_id];
  const next: Partial<MonitoringTask> = { ...patch };
  if (patch.frequency_sec != null) next.frequency_sec = Math.max(patch.frequency_sec, retailer.min_interval_sec);
  if (patch.is_active === false) next.status = 'paused';
  if (patch.is_active === true && !task.is_active) {
    next.status = 'monitoring';
    next.next_check_at = new Date().toISOString();
    next.consecutive_errors = 0;
    next.error_message = null;
  }
  if (patch.data_source && patch.data_source !== task.data_source) {
    next.next_check_at = new Date().toISOString();
    next.consecutive_errors = 0;
    next.error_message = null;
    if (task.status === 'error') next.status = 'monitoring';
  }
  const saved = await store.updateTask(id, next);
  if (saved) {
    store.publish({ type: 'task', task: saved });
    const changes = Object.keys(patch).join(', ');
    await store.addLog({ user_id: userId, task_id: id, level: 'info', message: `Task updated (${changes})`, context: patch });
  }
  return saved;
}

export async function duplicateTask(userId: string, id: string) {
  const store = getStore();
  const t = await getOwnedTask(userId, id);
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = t;
  const copy = await store.createTask({
    ...rest,
    is_active: false,
    status: 'paused',
    check_count: 0,
    restock_count: 0,
    consecutive_errors: 0,
    error_message: null,
    last_checked_at: null,
    next_check_at: new Date().toISOString(),
  });
  await store.addLog({ user_id: userId, task_id: copy.id, level: 'info', message: 'Task duplicated (starts paused)', context: { from: id } });
  store.publish({ type: 'task', task: copy });
  return copy;
}

export async function deleteTask(userId: string, id: string) {
  await getOwnedTask(userId, id);
  await getStore().deleteTask(id);
}

export async function checkNow(userId: string, id: string) {
  const t = await getOwnedTask(userId, id);
  if (!t.is_active) throw new HttpError(400, 'Resume the task before running a check');
  return getStore().updateTask(id, { next_check_at: new Date().toISOString() });
}
