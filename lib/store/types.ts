import type {
  EventType,
  LiveEvent,
  LogLevel,
  MonitoringTask,
  NotificationRow,
  Product,
  PurchaseActivity,
  Retailer,
  StockHistoryRow,
  TaskLog,
  UserRecord,
  UserSettings,
} from '../types';

export interface HistoryQuery {
  productId?: string;
  productIds?: string[];
  since?: string;
  eventTypes?: EventType[];
  limit?: number;
  /** newest first when true (default) */
  desc?: boolean;
}

export interface LogQuery {
  userId: string;
  taskId?: string;
  level?: LogLevel;
  limit?: number;
}

/**
 * Persistence contract shared by the local demo store and the Supabase store.
 * All user-owned reads take a userId so authorization is enforced in one place.
 */
export interface Store {
  readonly kind: 'local' | 'supabase';

  // users (local auth only — Supabase mode uses Supabase Auth)
  getUserByEmail(email: string): Promise<UserRecord | null>;
  getUser(id: string): Promise<UserRecord | null>;
  createUser(u: { email: string; password_hash?: string; display_name: string; id?: string }): Promise<UserRecord>;

  getSettings(userId: string): Promise<UserSettings>;
  updateSettings(userId: string, patch: Partial<UserSettings>): Promise<UserSettings>;

  /** Settings rows of every user who has the inbox watcher switched on. */
  listEmailWatchSettings(): Promise<UserSettings[]>;

  listRetailers(): Promise<Retailer[]>;

  listProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product | null>;
  getProductsByIds(ids: string[]): Promise<Product[]>;
  findProductByUrl(url: string): Promise<Product | null>;
  createProduct(p: Omit<Product, 'id' | 'created_at'>): Promise<Product>;
  updateProduct(id: string, patch: Partial<Product>): Promise<void>;

  listFavourites(userId: string): Promise<string[]>;
  setFavourite(userId: string, productId: string, fav: boolean): Promise<void>;

  listTasks(userId: string): Promise<MonitoringTask[]>;
  getTask(id: string): Promise<MonitoringTask | null>;
  createTask(t: Omit<MonitoringTask, 'id' | 'created_at' | 'updated_at'>): Promise<MonitoringTask>;
  updateTask(id: string, patch: Partial<MonitoringTask>): Promise<MonitoringTask | null>;
  deleteTask(id: string): Promise<void>;
  /** Active tasks whose next_check_at <= now, oldest first. Used by the scheduler (all users). */
  listDueTasks(now: string, limit: number): Promise<MonitoringTask[]>;
  /** Counts for every user's active tasks (used for system stats). */
  countActiveTasks(): Promise<number>;

  addStockHistory(row: Omit<StockHistoryRow, 'id'>): Promise<StockHistoryRow>;
  listStockHistory(q: HistoryQuery): Promise<StockHistoryRow[]>;

  addNotification(n: Omit<NotificationRow, 'id' | 'created_at'>): Promise<NotificationRow>;
  listNotifications(userId: string, limit?: number): Promise<NotificationRow[]>;

  addPurchaseActivity(a: Omit<PurchaseActivity, 'id' | 'created_at'>): Promise<PurchaseActivity>;
  listPurchaseActivity(userId: string, limit?: number): Promise<PurchaseActivity[]>;

  addLog(l: Omit<TaskLog, 'id' | 'created_at'>): Promise<TaskLog>;
  listLogs(q: LogQuery): Promise<TaskLog[]>;

  /** Subscribe to live events (restocks, task changes, notifications, logs). */
  subscribe(listener: (e: LiveEvent) => void): () => void;
  publish(e: LiveEvent): void;
}
