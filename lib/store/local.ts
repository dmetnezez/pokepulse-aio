import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type {
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
import { buildSeedCatalogue } from '../seed';
import { EMAIL_WATCH_DEFAULTS } from '../emailwatch/defaults';
import type { HistoryQuery, LogQuery, Store } from './types';

/**
 * Local demo store: everything lives in memory and is flushed to `.data/pokepulse.json`.
 * Single-process only — run the monitor embedded in the Next.js server (WORKER_MODE=embedded).
 * Use the Supabase store for multi-process / production deployments.
 */
interface DB {
  version: 1;
  users: UserRecord[];
  settings: UserSettings[];
  products: Product[];
  favourites: { user_id: string; product_id: string }[];
  tasks: MonitoringTask[];
  history: StockHistoryRow[];
  notifications: NotificationRow[];
  purchases: PurchaseActivity[];
  logs: TaskLog[];
  seq: { history: number; logs: number };
}

const CAP = { history: 60_000, notifications: 3_000, logs: 8_000, purchases: 3_000 };

const DATA_DIR = process.env.POKEPULSE_DATA_DIR ?? path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'pokepulse.json');

function defaultSettings(userId: string, email: string | null): UserSettings {
  return {
    user_id: userId,
    alert_email: email,
    discord_webhook_url: null,
    telegram_bot_token: null,
    telegram_chat_id: null,
    browser_notifications: true,
    default_frequency_sec: 60,
    quiet_hours_start: null,
    quiet_hours_end: null,
    ...EMAIL_WATCH_DEFAULTS,
  };
}

export class LocalStore implements Store {
  readonly kind = 'local' as const;
  private db: DB;
  private emitter = new EventEmitter();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.emitter.setMaxListeners(500);
    this.db = this.load();
  }

  private load(): DB {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as DB;
        if (db.version === 1) return db;
      }
    } catch (err) {
      console.error('[store] could not read data file, re-seeding:', err);
    }
    const seed = buildSeedCatalogue();
    const db: DB = {
      version: 1,
      users: [],
      settings: [],
      products: seed.products,
      favourites: [],
      tasks: [],
      history: seed.history.map((h, i) => ({ ...h, id: i + 1 })),
      notifications: [],
      purchases: [],
      logs: [],
      seq: { history: seed.history.length, logs: 0 },
    };
    this.db = db;
    this.flush();
    return db;
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 1500);
  }

  private flush() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = DATA_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.db));
      fs.renameSync(tmp, DATA_FILE);
    } catch (err) {
      console.error('[store] failed to persist data file:', err);
    }
  }

  private trim<K extends 'history' | 'notifications' | 'logs' | 'purchases'>(key: K) {
    const arr = this.db[key] as unknown[];
    const cap = CAP[key];
    if (arr.length > cap * 1.1) arr.splice(0, arr.length - cap);
  }

  // ── users ──
  async getUserByEmail(email: string) {
    return this.db.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  }
  async getUser(id: string) {
    return this.db.users.find((u) => u.id === id) ?? null;
  }
  async createUser(u: { email: string; password_hash?: string; display_name: string; id?: string }) {
    const user: UserRecord = {
      id: u.id ?? randomUUID(),
      email: u.email.toLowerCase(),
      display_name: u.display_name,
      password_hash: u.password_hash,
      created_at: new Date().toISOString(),
    };
    this.db.users.push(user);
    this.db.settings.push(defaultSettings(user.id, user.email));
    this.scheduleSave();
    return user;
  }

  async getSettings(userId: string) {
    let s = this.db.settings.find((x) => x.user_id === userId);
    if (!s) {
      s = defaultSettings(userId, null);
      this.db.settings.push(s);
    }
    return { ...EMAIL_WATCH_DEFAULTS, ...s };
  }
  async updateSettings(userId: string, patch: Partial<UserSettings>) {
    await this.getSettings(userId);
    const s = this.db.settings.find((x) => x.user_id === userId)!;
    Object.assign(s, patch, { user_id: userId });
    this.scheduleSave();
    return { ...s };
  }

  async listEmailWatchSettings() {
    return this.db.settings.filter((s) => s.email_watch_enabled).map((s) => ({ ...EMAIL_WATCH_DEFAULTS, ...s }));
  }

  async listRetailers() {
    return RETAILERS;
  }

  // ── products ──
  async listProducts() {
    return this.db.products.map((p) => ({ ...p }));
  }
  async getProduct(id: string) {
    const p = this.db.products.find((x) => x.id === id);
    return p ? { ...p } : null;
  }
  async getProductsByIds(ids: string[]) {
    const set = new Set(ids);
    return this.db.products.filter((p) => set.has(p.id)).map((p) => ({ ...p }));
  }
  async findProductByUrl(url: string) {
    return this.db.products.find((p) => p.url === url) ?? null;
  }
  async createProduct(p: Omit<Product, 'id' | 'created_at'>) {
    const product: Product = { ...p, id: randomUUID(), created_at: new Date().toISOString() };
    this.db.products.push(product);
    this.scheduleSave();
    return { ...product };
  }
  async updateProduct(id: string, patch: Partial<Product>) {
    const p = this.db.products.find((x) => x.id === id);
    if (p) Object.assign(p, patch, { id });
    this.scheduleSave();
  }

  async listFavourites(userId: string) {
    return this.db.favourites.filter((f) => f.user_id === userId).map((f) => f.product_id);
  }
  async setFavourite(userId: string, productId: string, fav: boolean) {
    this.db.favourites = this.db.favourites.filter((f) => !(f.user_id === userId && f.product_id === productId));
    if (fav) this.db.favourites.push({ user_id: userId, product_id: productId });
    this.scheduleSave();
  }

  // ── tasks ──
  async listTasks(userId: string) {
    return this.db.tasks
      .filter((t) => t.user_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((t) => ({ ...t }));
  }
  async getTask(id: string) {
    const t = this.db.tasks.find((x) => x.id === id);
    return t ? { ...t } : null;
  }
  async createTask(t: Omit<MonitoringTask, 'id' | 'created_at' | 'updated_at'>) {
    const now = new Date().toISOString();
    const task: MonitoringTask = { ...t, id: randomUUID(), created_at: now, updated_at: now };
    this.db.tasks.push(task);
    this.scheduleSave();
    return { ...task };
  }
  async updateTask(id: string, patch: Partial<MonitoringTask>) {
    const t = this.db.tasks.find((x) => x.id === id);
    if (!t) return null;
    Object.assign(t, patch, { id, updated_at: new Date().toISOString() });
    this.scheduleSave();
    return { ...t };
  }
  async deleteTask(id: string) {
    this.db.tasks = this.db.tasks.filter((t) => t.id !== id);
    this.scheduleSave();
  }
  async listDueTasks(now: string, limit: number) {
    return this.db.tasks
      .filter((t) => t.is_active && t.next_check_at <= now)
      .sort((a, b) => a.next_check_at.localeCompare(b.next_check_at))
      .slice(0, limit)
      .map((t) => ({ ...t }));
  }
  async countActiveTasks() {
    return this.db.tasks.filter((t) => t.is_active).length;
  }

  // ── history ──
  async addStockHistory(row: Omit<StockHistoryRow, 'id'>) {
    const r: StockHistoryRow = { ...row, id: ++this.db.seq.history };
    this.db.history.push(r);
    this.trim('history');
    this.scheduleSave();
    return r;
  }
  async listStockHistory(q: HistoryQuery) {
    const ids = q.productIds ? new Set(q.productIds) : null;
    const types = q.eventTypes ? new Set(q.eventTypes) : null;
    const out: StockHistoryRow[] = [];
    const desc = q.desc ?? true;
    const limit = q.limit ?? 5_000;
    const src = this.db.history;
    // history is append-only in time order, so scan from the newest end
    for (let i = src.length - 1; i >= 0; i--) {
      const h = src[i];
      if (q.since && h.checked_at < q.since) break;
      if (q.productId && h.product_id !== q.productId) continue;
      if (ids && !ids.has(h.product_id)) continue;
      if (types && !types.has(h.event_type)) continue;
      out.push(h);
      if (out.length >= limit) break;
    }
    return desc ? out : out.reverse();
  }

  async addNotification(n: Omit<NotificationRow, 'id' | 'created_at'>) {
    const row: NotificationRow = { ...n, id: randomUUID(), created_at: new Date().toISOString() };
    this.db.notifications.push(row);
    this.trim('notifications');
    this.scheduleSave();
    return row;
  }
  async listNotifications(userId: string, limit = 200) {
    return this.db.notifications.filter((n) => n.user_id === userId).slice(-limit).reverse();
  }

  async addPurchaseActivity(a: Omit<PurchaseActivity, 'id' | 'created_at'>) {
    const row: PurchaseActivity = { ...a, id: randomUUID(), created_at: new Date().toISOString() };
    this.db.purchases.push(row);
    this.trim('purchases');
    this.scheduleSave();
    return row;
  }
  async listPurchaseActivity(userId: string, limit = 200) {
    return this.db.purchases.filter((p) => p.user_id === userId).slice(-limit).reverse();
  }

  async addLog(l: Omit<TaskLog, 'id' | 'created_at'>) {
    const row: TaskLog = { ...l, id: ++this.db.seq.logs, created_at: new Date().toISOString() };
    this.db.logs.push(row);
    this.trim('logs');
    this.scheduleSave();
    return row;
  }
  async listLogs(q: LogQuery) {
    const out: TaskLog[] = [];
    const limit = q.limit ?? 300;
    for (let i = this.db.logs.length - 1; i >= 0 && out.length < limit; i--) {
      const l = this.db.logs[i];
      if (l.user_id !== q.userId) continue;
      if (q.taskId && l.task_id !== q.taskId) continue;
      if (q.level && l.level !== q.level) continue;
      out.push(l);
    }
    return out;
  }

  subscribe(listener: (e: LiveEvent) => void) {
    this.emitter.on('event', listener);
    return () => {
      this.emitter.off('event', listener);
    };
  }
  publish(e: LiveEvent) {
    this.emitter.emit('event', e);
  }
}
