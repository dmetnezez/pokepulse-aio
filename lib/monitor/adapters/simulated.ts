import type { Product, RetailerId, StockStatus } from '../../types';
import { isAvailable } from '../../types';
import { marketPrice, RESTOCK_RATE } from '../../seed';
import { IntegrationError, type CheckResult, type RetailerAdapter } from './types';

interface SimState {
  inStock: boolean;
  price: number;
  status: StockStatus;
}

const g = globalThis as unknown as { __pokepulseSim?: Map<string, SimState> };
const state = (g.__pokepulseSim ??= new Map());

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Simulation engine used for every retailer without an authorized integration.
 * Produces plausible restock/sell-out cycles, price drift, latency and occasional upstream errors.
 * Every result is tagged `source: 'simulated'` and the UI labels it as such everywhere.
 */
export class SimulatedAdapter implements RetailerAdapter {
  readonly id = 'simulated';
  readonly source = 'simulated' as const;
  readonly retailers = '*' as const;

  /** probability multiplier — raise via SIMULATION_INTENSITY for livelier demos */
  private intensity = Number(process.env.SIMULATION_INTENSITY ?? 1) || 1;

  isConfigured() {
    return true;
  }

  async check(product: Product): Promise<CheckResult> {
    const latency = 150 + Math.floor(Math.random() * 1200);
    await sleep(Math.min(latency / 4, 400));

    // ~1.5% transient upstream failures so error handling and backoff get exercised.
    const roll = Math.random();
    if (roll < 0.008) throw new IntegrationError('UPSTREAM', 'Simulated upstream error: HTTP 503 Service Unavailable');
    if (roll < 0.015) throw new IntegrationError('TIMEOUT', 'Simulated timeout after 8000 ms');

    let s = state.get(product.id);
    if (!s) {
      s = {
        inStock: isAvailable(product.stock_status),
        price: product.current_price ?? product.msrp ?? 49.99,
        status: product.stock_status === 'unknown' ? 'out_of_stock' : product.stock_status,
      };
      state.set(product.id, s);
    }

    const rate = RESTOCK_RATE[product.retailer_id as RetailerId] ?? 1;
    if (!s.inStock && s.status !== 'preorder' && Math.random() < 0.035 * rate * this.intensity) {
      s.inStock = true;
      s.status = Math.random() < 0.35 ? 'limited' : 'in_stock';
    } else if (s.inStock && Math.random() < 0.2) {
      s.inStock = false;
      s.status = 'out_of_stock';
    } else if (s.status === 'preorder' && Math.random() < 0.02) {
      s.status = 'out_of_stock';
    } else if (s.inStock && s.status === 'in_stock' && Math.random() < 0.15) {
      s.status = 'limited';
    }
    if (Math.random() < 0.02 && product.msrp) {
      s.price = Math.round(marketPrice(product.retailer_id as RetailerId, product.msrp, Math.random) * 100) / 100;
    }

    return { status: s.status, price: s.price, currency: 'CAD', source: 'simulated', latencyMs: latency };
  }
}
