import type { DataSource, MonitoringTask, RetailerId } from '../types';
import { RETAILER_MAP } from '../retailers';
import { getStore } from '../store';
import { checkProduct } from './engine';

interface Job {
  productId: string;
  source: DataSource;
  taskIds: string[];
  /** set for catalogue-sweep jobs, which run without tasks */
  sweepKey?: string;
}

interface RetailerLane {
  active: number;
  lastStart: number;
  queue: Job[];
  timer: NodeJS.Timeout | null;
}

export interface SchedulerStats {
  running: boolean;
  startedAt: string | null;
  lastTickAt: string | null;
  lastError: string | null;
  checksLastMinute: number;
  errorsLastMinute: number;
  queued: number;
  inflight: number;
  totalChecks: number;
}

/**
 * Polls for due tasks, de-duplicates them per product, and pushes checks through per-retailer lanes
 * that enforce each retailer's max concurrency and minimum request spacing.
 */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private inflight = new Set<string>(); // task ids queued or running
  private lanes = new Map<RetailerId, RetailerLane>();
  private checkTimes: number[] = [];
  private errorTimes: number[] = [];
  private totalChecks = 0;
  private startedAt: string | null = null;
  private lastTickAt: string | null = null;
  private lastError: string | null = null;
  private lastSweep = 0;

  constructor(private intervalMs = 2000, private batchSize = 500) {}

  start() {
    if (this.timer) return;
    this.startedAt = new Date().toISOString();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    void this.tick();
    console.log(`[monitor] scheduler started (store=${getStore().kind}, tick=${this.intervalMs}ms)`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  stats(): SchedulerStats {
    const cutoff = Date.now() - 60_000;
    this.checkTimes = this.checkTimes.filter((t) => t > cutoff);
    this.errorTimes = this.errorTimes.filter((t) => t > cutoff);
    let queued = 0;
    for (const lane of this.lanes.values()) queued += lane.queue.length;
    return {
      running: Boolean(this.timer),
      startedAt: this.startedAt,
      lastTickAt: this.lastTickAt,
      lastError: this.lastError,
      checksLastMinute: this.checkTimes.length,
      errorsLastMinute: this.errorTimes.length,
      queued,
      inflight: this.inflight.size,
      totalChecks: this.totalChecks,
    };
  }

  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const store = getStore();
      const due = (await store.listDueTasks(new Date().toISOString(), this.batchSize)).filter((t) => !this.inflight.has(t.id));
      this.lastTickAt = new Date().toISOString();
      await this.sweepCatalogue();
      if (!due.length) return;

      const groups = new Map<string, { retailer: RetailerId; job: Job }>();
      for (const t of due) {
        const key = `${t.product_id}:${t.data_source}`;
        let g = groups.get(key);
        if (!g) {
          g = { retailer: t.retailer_id, job: { productId: t.product_id, source: t.data_source, taskIds: [] } };
          groups.set(key, g);
        }
        g.job.taskIds.push(t.id);
        this.inflight.add(t.id);
      }
      for (const { retailer, job } of groups.values()) this.enqueue(retailer, job);
      this.lastError = null;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      console.error('[monitor] tick failed:', err);
    } finally {
      this.ticking = false;
    }
  }

  /**
   * Keep the rest of the catalogue fresh: every 15s, re-check the few stalest listings (watched listings
   * are checked far more often by their tasks, so this mostly covers unwatched ones). Goes through the same per-retailer lanes, so it never exceeds retailer limits.
   * Only simulated listings are swept — live API quota is reserved for users' tasks.
   */
  private async sweepCatalogue() {
    if (process.env.CATALOGUE_SWEEP === 'off' || Date.now() - this.lastSweep < 15_000) return;
    this.lastSweep = Date.now();
    const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
    const products = (await getStore().listProducts())
      .filter((p) => p.data_source === 'simulated' && (p.last_checked_at ?? '') < staleBefore && !this.inflight.has(`sweep:${p.id}`))
      .sort((a, b) => (a.last_checked_at ?? '').localeCompare(b.last_checked_at ?? ''))
      .slice(0, 4);
    for (const p of products) {
      this.inflight.add(`sweep:${p.id}`);
      this.enqueue(p.retailer_id, { productId: p.id, source: 'simulated', taskIds: [], sweepKey: `sweep:${p.id}` });
    }
  }

  private lane(retailer: RetailerId): RetailerLane {
    let lane = this.lanes.get(retailer);
    if (!lane) {
      lane = { active: 0, lastStart: 0, queue: [], timer: null };
      this.lanes.set(retailer, lane);
    }
    return lane;
  }

  private enqueue(retailer: RetailerId, job: Job) {
    this.lane(retailer).queue.push(job);
    this.pump(retailer);
  }

  private pump(retailer: RetailerId) {
    const lane = this.lane(retailer);
    const cfg = RETAILER_MAP[retailer] ?? { max_concurrency: 1, request_spacing_ms: 1000 };
    while (lane.queue.length && lane.active < cfg.max_concurrency) {
      const wait = lane.lastStart + cfg.request_spacing_ms - Date.now();
      if (wait > 0) {
        if (!lane.timer)
          lane.timer = setTimeout(() => {
            lane.timer = null;
            this.pump(retailer);
          }, wait);
        return;
      }
      const job = lane.queue.shift()!;
      lane.active++;
      lane.lastStart = Date.now();
      void this.run(job).finally(() => {
        lane.active--;
        this.pump(retailer);
      });
    }
  }

  private async run(job: Job) {
    const store = getStore();
    try {
      const [product, ...tasks] = await Promise.all([
        store.getProduct(job.productId),
        ...job.taskIds.map((id) => store.getTask(id)),
      ]);
      const live = (tasks as (MonitoringTask | null)[]).filter((t): t is MonitoringTask => Boolean(t && t.is_active));
      if (!product || (!live.length && !job.sweepKey)) return;
      const outcome = await checkProduct(product, live, job.source);
      this.totalChecks++;
      this.checkTimes.push(Date.now());
      if (!outcome.ok) this.errorTimes.push(Date.now());
    } catch (err) {
      this.errorTimes.push(Date.now());
      this.lastError = err instanceof Error ? err.message : String(err);
      console.error('[monitor] job failed:', err);
    } finally {
      for (const id of job.taskIds) this.inflight.delete(id);
      if (job.sweepKey) this.inflight.delete(job.sweepKey);
    }
  }
}

const g = globalThis as unknown as { __pokepulseScheduler?: Scheduler };

export function getScheduler(): Scheduler {
  return (g.__pokepulseScheduler ??= new Scheduler());
}
