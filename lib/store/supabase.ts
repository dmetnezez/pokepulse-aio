import { EventEmitter } from 'node:events';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  ActivityItem,
  LiveEvent,
  MonitoringTask,
  NotificationRow,
  Product,
  PurchaseActivity,
  StockHistoryRow,
  TaskLog,
  UserRecord,
  UserSettings,
} from '../types';
import { RETAILERS } from '../retailers';
import type { HistoryQuery, LogQuery, Store } from './types';

/**
 * Supabase/Postgres store. Uses the service-role key server-side and always filters by user_id
 * for user-owned data. Safe to share between the Next.js server and one or more workers.
 */
export class SupabaseStore implements Store {
  readonly kind = 'supabase' as const;
  readonly client: SupabaseClient;
  private emitter = new EventEmitter();
  private pollTimer: NodeJS.Timeout | null = null;
  private lastEventId = 0;
  private lastTaskUpdate = new Date().toISOString();

  constructor(url: string, serviceKey: string) {
    this.client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    this.emitter.setMaxListeners(500);
  }

  private must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
    if (res.error) throw new Error(`[supabase] ${what}: ${res.error.message}`);
    return res.data as T;
  }

  async getUserByEmail(email: string) {
    const res = await this.client.from('profiles').select('id,email,display_name,created_at').ilike('email', email).maybeSingle();
    return this.must(res, 'getUserByEmail') as UserRecord | null;
  }
  async getUser(id: string) {
    const res = await this.client.from('profiles').select('id,email,display_name,created_at').eq('id', id).maybeSingle();
    return this.must(res, 'getUser') as UserRecord | null;
  }
  async createUser(u: { email: string; display_name: string; id?: string }) {
    // The auth.users trigger creates the profile; upsert to be safe.
    const res = await this.client
      .from('profiles')
      .upsert({ id: u.id, email: u.email, display_name: u.display_name, alert_email: u.email })
      .select('id,email,display_name,created_at')
      .single();
    return this.must(res, 'createUser') as UserRecord;
  }

  async getSettings(userId: string): Promise<UserSettings> {
    const res = await this.client
      .from('profiles')
      .select('id,alert_email,discord_webhook_url,telegram_bot_token,telegram_chat_id,browser_notifications,default_frequency_sec,quiet_hours_start,quiet_hours_end')
      .eq('id', userId)
      .single();
    const { id, ...rest } = this.must(res, 'getSettings') as Omit<UserSettings, 'user_id'> & { id: string };
    return { ...rest, user_id: id };
  }
  async updateSettings(userId: string, patch: Partial<UserSettings>) {
    const { user_id: _ignored, ...rest } = patch;
    this.must(await this.client.from('profiles').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', userId), 'updateSettings');
    return this.getSettings(userId);
  }

  async listRetailers() {
    return RETAILERS;
  }

  async listProducts() {
    const out: Product[] = [];
    for (let from = 0; ; from += 1000) {
      const res = await this.client.from('products').select('*').order('name').range(from, from + 999);
      const rows = this.must(res, 'listProducts') as Product[];
      out.push(...rows);
      if (rows.length < 1000) break;
    }
    return out;
  }
  async getProduct(id: string) {
    return this.must(await this.client.from('products').select('*').eq('id', id).maybeSingle(), 'getProduct') as Product | null;
  }
  async getProductsByIds(ids: string[]) {
    if (!ids.length) return [];
    return this.must(await this.client.from('products').select('*').in('id', ids), 'getProductsByIds') as Product[];
  }
  async findProductByUrl(url: string) {
    return this.must(await this.client.from('products').select('*').eq('url', url).maybeSingle(), 'findProductByUrl') as Product | null;
  }
  async createProduct(p: Omit<Product, 'id' | 'created_at'>) {
    return this.must(await this.client.from('products').insert(p).select('*').single(), 'createProduct') as Product;
  }
  async updateProduct(id: string, patch: Partial<Product>) {
    const { id: _i, created_at: _c, ...rest } = patch;
    this.must(await this.client.from('products').update(rest).eq('id', id), 'updateProduct');
  }

  async listFavourites(userId: string) {
    const rows = this.must(await this.client.from('favourites').select('product_id').eq('user_id', userId), 'listFavourites') as { product_id: string }[];
    return rows.map((r) => r.product_id);
  }
  async setFavourite(userId: string, productId: string, fav: boolean) {
    if (fav) this.must(await this.client.from('favourites').upsert({ user_id: userId, product_id: productId }), 'setFavourite');
    else this.must(await this.client.from('favourites').delete().eq('user_id', userId).eq('product_id', productId), 'setFavourite');
  }

  async listTasks(userId: string) {
    return this.must(
      await this.client.from('monitoring_tasks').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(2000),
      'listTasks',
    ) as MonitoringTask[];
  }
  async getTask(id: string) {
    return this.must(await this.client.from('monitoring_tasks').select('*').eq('id', id).maybeSingle(), 'getTask') as MonitoringTask | null;
  }
  async createTask(t: Omit<MonitoringTask, 'id' | 'created_at' | 'updated_at'>) {
    return this.must(await this.client.from('monitoring_tasks').insert(t).select('*').single(), 'createTask') as MonitoringTask;
  }
  async updateTask(id: string, patch: Partial<MonitoringTask>) {
    const { id: _i, created_at: _c, user_id: _u, ...rest } = patch;
    return this.must(
      await this.client.from('monitoring_tasks').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', id).select('*').maybeSingle(),
      'updateTask',
    ) as MonitoringTask | null;
  }
  async deleteTask(id: string) {
    this.must(await this.client.from('monitoring_tasks').delete().eq('id', id), 'deleteTask');
  }
  async listDueTasks(now: string, limit: number) {
    return this.must(
      await this.client.from('monitoring_tasks').select('*').eq('is_active', true).lte('next_check_at', now).order('next_check_at').limit(limit),
      'listDueTasks',
    ) as MonitoringTask[];
  }
  async countActiveTasks() {
    const res = await this.client.from('monitoring_tasks').select('id', { count: 'exact', head: true }).eq('is_active', true);
    if (res.error) throw new Error(res.error.message);
    return res.count ?? 0;
  }

  async addStockHistory(row: Omit<StockHistoryRow, 'id'>) {
    return this.must(await this.client.from('stock_history').insert(row).select('*').single(), 'addStockHistory') as StockHistoryRow;
  }
  async listStockHistory(q: HistoryQuery) {
    let query = this.client.from('stock_history').select('*');
    if (q.productId) query = query.eq('product_id', q.productId);
    if (q.productIds) query = query.in('product_id', q.productIds);
    if (q.since) query = query.gte('checked_at', q.since);
    if (q.eventTypes) query = query.in('event_type', q.eventTypes);
    const desc = q.desc ?? true;
    const rows = this.must(await query.order('checked_at', { ascending: false }).limit(q.limit ?? 5000), 'listStockHistory') as StockHistoryRow[];
    return desc ? rows : rows.reverse();
  }

  async addNotification(n: Omit<NotificationRow, 'id' | 'created_at'>) {
    return this.must(await this.client.from('notifications').insert(n).select('*').single(), 'addNotification') as NotificationRow;
  }
  async listNotifications(userId: string, limit = 200) {
    return this.must(
      await this.client.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit),
      'listNotifications',
    ) as NotificationRow[];
  }

  async addPurchaseActivity(a: Omit<PurchaseActivity, 'id' | 'created_at'>) {
    return this.must(await this.client.from('purchase_activity').insert(a).select('*').single(), 'addPurchaseActivity') as PurchaseActivity;
  }
  async listPurchaseActivity(userId: string, limit = 200) {
    return this.must(
      await this.client.from('purchase_activity').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit),
      'listPurchaseActivity',
    ) as PurchaseActivity[];
  }

  async addLog(l: Omit<TaskLog, 'id' | 'created_at'>) {
    return this.must(await this.client.from('task_logs').insert(l).select('*').single(), 'addLog') as TaskLog;
  }
  async listLogs(q: LogQuery) {
    let query = this.client.from('task_logs').select('*').eq('user_id', q.userId);
    if (q.taskId) query = query.eq('task_id', q.taskId);
    if (q.level) query = query.eq('level', q.level);
    return this.must(await query.order('created_at', { ascending: false }).limit(q.limit ?? 300), 'listLogs') as TaskLog[];
  }

  subscribe(listener: (e: LiveEvent) => void) {
    this.emitter.on('event', listener);
    // With an external worker, events happen in another process: poll Postgres for them.
    if (process.env.WORKER_MODE === 'external' && !this.pollTimer) this.startPolling();
    return () => {
      this.emitter.off('event', listener);
      if (this.emitter.listenerCount('event') === 0 && this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    };
  }

  publish(e: LiveEvent) {
    this.emitter.emit('event', e);
  }

  private startPolling() {
    const tick = async () => {
      try {
        let q = this.client.from('stock_history').select('*').neq('event_type', 'check').order('id', { ascending: true }).limit(100);
        q = this.lastEventId ? q.gt('id', this.lastEventId) : q.gte('checked_at', new Date(Date.now() - 5000).toISOString());
        const events = (this.must(await q, 'poll events') as StockHistoryRow[]) ?? [];
        if (events.length) {
          this.lastEventId = events[events.length - 1].id;
          const products = await this.getProductsByIds([...new Set(events.map((e) => e.product_id))]);
          const byId = new Map(products.map((p) => [p.id, p]));
          for (const h of events) {
            const p = byId.get(h.product_id);
            const item: ActivityItem = { ...h, product_name: p?.name ?? 'Unknown product', url: p?.url ?? '' };
            this.emitter.emit('event', { type: 'activity', event: item } satisfies LiveEvent);
          }
        }
        const tasks = this.must(
          await this.client.from('monitoring_tasks').select('*').gt('updated_at', this.lastTaskUpdate).order('updated_at').limit(500),
          'poll tasks',
        ) as MonitoringTask[];
        if (tasks.length) {
          this.lastTaskUpdate = tasks[tasks.length - 1].updated_at;
          for (const t of tasks) this.emitter.emit('event', { type: 'task', task: t } satisfies LiveEvent);
        }
      } catch (err) {
        console.error('[supabase] live poll failed:', err);
      }
    };
    this.pollTimer = setInterval(tick, 2000);
  }
}
