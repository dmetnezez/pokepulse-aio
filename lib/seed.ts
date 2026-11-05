import { randomUUID } from 'node:crypto';
import type {
  Category,
  MonitoringTask,
  Product,
  RetailerId,
  StockHistoryRow,
  StockStatus,
} from './types';
import { RETAILER_MAP } from './retailers';

/** Deterministic PRNG so the demo looks the same on every fresh install. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Links point at each retailer's real search page for the product, so they always resolve. */
export function retailerSearchUrl(retailer: RetailerId, query: string): string {
  const q = encodeURIComponent(query);
  switch (retailer) {
    case 'pokemon-center-ca':
      return `https://www.pokemoncenter.com/en-ca/search/${q}`;
    case 'walmart-ca':
      return `https://www.walmart.ca/en/search?q=${q}`;
    case 'bestbuy-ca':
      return `https://www.bestbuy.ca/en-ca/search?search=${q}`;
    case 'gamestop-ca':
      return `https://www.gamestop.ca/SearchResult/QuickSearch?q=${q}`;
    case 'toysrus-ca':
      return `https://www.toysrus.ca/en/search?q=${q}`;
    case 'costco-ca':
      return `https://www.costco.ca/CatalogSearch?keyword=${q}`;
    case 'amazon-ca':
      return `https://www.amazon.ca/s?k=${q}`;
  }
}

interface CatalogueEntry {
  name: string;
  category: Category;
  set: string;
  msrp: number;
  lang?: 'EN' | 'JP';
  retailers: RetailerId[];
}

export const CATALOGUE: CatalogueEntry[] = [
  { name: 'Scarlet & Violet—151 Elite Trainer Box', category: 'pokemon-151', set: '151', msrp: 69.99, retailers: ['pokemon-center-ca', 'walmart-ca', 'bestbuy-ca', 'amazon-ca'] },
  { name: 'Scarlet & Violet—151 Booster Bundle', category: 'pokemon-151', set: '151', msrp: 39.99, retailers: ['walmart-ca', 'gamestop-ca', 'amazon-ca'] },
  { name: 'Scarlet & Violet—151 Ultra-Premium Collection', category: 'pokemon-151', set: '151', msrp: 159.99, retailers: ['pokemon-center-ca', 'bestbuy-ca'] },
  { name: 'Scarlet & Violet—151 Poster Collection', category: 'pokemon-151', set: '151', msrp: 29.99, retailers: ['toysrus-ca', 'walmart-ca'] },
  { name: 'Prismatic Evolutions Elite Trainer Box', category: 'special-set', set: 'Prismatic Evolutions', msrp: 79.99, retailers: ['pokemon-center-ca', 'walmart-ca', 'bestbuy-ca', 'gamestop-ca', 'amazon-ca'] },
  { name: 'Prismatic Evolutions Booster Bundle', category: 'special-set', set: 'Prismatic Evolutions', msrp: 39.99, retailers: ['walmart-ca', 'toysrus-ca'] },
  { name: 'Prismatic Evolutions Surprise Box', category: 'collection-box', set: 'Prismatic Evolutions', msrp: 39.99, retailers: ['bestbuy-ca', 'gamestop-ca'] },
  { name: 'Prismatic Evolutions Binder Collection', category: 'collection-box', set: 'Prismatic Evolutions', msrp: 44.99, retailers: ['walmart-ca', 'toysrus-ca'] },
  { name: 'Prismatic Evolutions Super-Premium Collection', category: 'premium-collection', set: 'Prismatic Evolutions', msrp: 129.99, retailers: ['pokemon-center-ca', 'bestbuy-ca'] },
  { name: 'Paldean Fates Elite Trainer Box', category: 'special-set', set: 'Paldean Fates', msrp: 69.99, retailers: ['walmart-ca', 'amazon-ca'] },
  { name: 'Paldean Fates Tech Sticker Collection', category: 'collection-box', set: 'Paldean Fates', msrp: 24.99, retailers: ['toysrus-ca'] },
  { name: 'Surging Sparks Booster Box', category: 'booster-box', set: 'Surging Sparks', msrp: 219.99, retailers: ['bestbuy-ca', 'gamestop-ca', 'amazon-ca'] },
  { name: 'Surging Sparks Elite Trainer Box', category: 'etb', set: 'Surging Sparks', msrp: 69.99, retailers: ['walmart-ca', 'toysrus-ca'] },
  { name: 'Journey Together Elite Trainer Box', category: 'etb', set: 'Journey Together', msrp: 69.99, retailers: ['pokemon-center-ca', 'walmart-ca', 'bestbuy-ca'] },
  { name: 'Journey Together Booster Bundle', category: 'booster-bundle', set: 'Journey Together', msrp: 39.99, retailers: ['gamestop-ca', 'walmart-ca'] },
  { name: 'Destined Rivals Elite Trainer Box', category: 'etb', set: 'Destined Rivals', msrp: 69.99, retailers: ['pokemon-center-ca', 'bestbuy-ca', 'amazon-ca'] },
  { name: 'Destined Rivals Booster Box', category: 'booster-box', set: 'Destined Rivals', msrp: 229.99, retailers: ['gamestop-ca', 'amazon-ca'] },
  { name: 'Destined Rivals Booster Bundle', category: 'booster-bundle', set: 'Destined Rivals', msrp: 39.99, retailers: ['walmart-ca', 'toysrus-ca'] },
  { name: 'Black Bolt Elite Trainer Box', category: 'etb', set: 'Black Bolt', msrp: 79.99, retailers: ['pokemon-center-ca', 'walmart-ca'] },
  { name: 'White Flare Elite Trainer Box', category: 'etb', set: 'White Flare', msrp: 79.99, retailers: ['pokemon-center-ca', 'bestbuy-ca'] },
  { name: 'Mega Evolution Elite Trainer Box', category: 'etb', set: 'Mega Evolution', msrp: 79.99, retailers: ['pokemon-center-ca', 'walmart-ca', 'bestbuy-ca', 'gamestop-ca'] },
  { name: 'Mega Evolution Booster Box', category: 'booster-box', set: 'Mega Evolution', msrp: 229.99, retailers: ['gamestop-ca', 'amazon-ca'] },
  { name: 'Mega Evolution Booster Bundle', category: 'booster-bundle', set: 'Mega Evolution', msrp: 44.99, retailers: ['walmart-ca', 'bestbuy-ca'] },
  { name: 'Phantasmal Flames Elite Trainer Box', category: 'etb', set: 'Phantasmal Flames', msrp: 79.99, retailers: ['pokemon-center-ca', 'bestbuy-ca'] },
  { name: 'Charizard ex Super-Premium Collection', category: 'premium-collection', set: 'Charizard ex', msrp: 149.99, retailers: ['bestbuy-ca', 'costco-ca', 'amazon-ca'] },
  { name: 'Combined Powers Premium Collection', category: 'premium-collection', set: 'Combined Powers', msrp: 79.99, retailers: ['walmart-ca', 'costco-ca'] },
  { name: 'Terapagos ex Ultra-Premium Collection', category: 'premium-collection', set: 'Terapagos ex', msrp: 169.99, retailers: ['pokemon-center-ca'] },
  { name: 'Pokémon TCG Holiday Collector Bundle', category: 'collection-box', set: 'Holiday', msrp: 89.99, retailers: ['costco-ca'] },
  { name: 'Pokémon Card 151 Booster Box (Japanese)', category: 'japanese', set: '151', msrp: 129.99, lang: 'JP', retailers: ['amazon-ca', 'gamestop-ca'] },
  { name: 'Terastal Festival ex Booster Box (Japanese)', category: 'japanese', set: 'Terastal Festival ex', msrp: 99.99, lang: 'JP', retailers: ['amazon-ca'] },
  { name: 'Battle Partners Booster Box (Japanese)', category: 'japanese', set: 'Battle Partners', msrp: 89.99, lang: 'JP', retailers: ['amazon-ca', 'gamestop-ca'] },
  { name: 'Mega Brave Booster Box (Japanese)', category: 'japanese', set: 'Mega Brave', msrp: 84.99, lang: 'JP', retailers: ['amazon-ca'] },
  { name: 'Mega Symphonia Booster Box (Japanese)', category: 'japanese', set: 'Mega Symphonia', msrp: 84.99, lang: 'JP', retailers: ['amazon-ca'] },
];

/** How often each retailer restocks in the simulation, relative to 1.0. */
export const RESTOCK_RATE: Record<RetailerId, number> = {
  'pokemon-center-ca': 0.7,
  'walmart-ca': 1.4,
  'bestbuy-ca': 1.1,
  'gamestop-ca': 0.9,
  'toysrus-ca': 0.8,
  'costco-ca': 0.5,
  'amazon-ca': 1.6,
};

/** Third-party sellers push Amazon/Walmart prices above MSRP. */
export function marketPrice(retailer: RetailerId, msrp: number, rnd: () => number): number {
  let factor = 1;
  if (retailer === 'amazon-ca') factor = 1 + rnd() * 0.55;
  else if (retailer === 'walmart-ca') factor = rnd() < 0.3 ? 1 + rnd() * 0.25 : 1;
  else if (retailer === 'costco-ca') factor = 0.9;
  else if (rnd() < 0.08) factor = 0.85; // occasional sale
  return Math.round(msrp * factor * 100) / 100 - (factor === 1 ? 0 : 0.01 * Math.round(rnd()));
}

export interface SeedData {
  products: Product[];
  history: Omit<StockHistoryRow, 'id'>[];
}

export function buildSeedCatalogue(now = Date.now()): SeedData {
  const rnd = mulberry32(151);
  const products: Product[] = [];
  const history: Omit<StockHistoryRow, 'id'>[] = [];
  const DAYS = 30;
  const start = now - DAYS * 86_400_000;

  for (const entry of CATALOGUE) {
    for (const retailer of entry.retailers) {
      const id = randomUUID();
      let price = Math.round(marketPrice(retailer, entry.msrp, rnd) * 100) / 100;
      let prevPrice: number | null = null;
      let inStock = rnd() < 0.3;
      let lastRestock: number | null = null;
      const rate = RESTOCK_RATE[retailer] * (entry.category === 'special-set' || entry.category === 'pokemon-151' ? 0.6 : 1);

      // Walk forward in 2h steps generating restock / sell-out / price events and periodic checks.
      for (let t = start; t <= now; t += 2 * 3_600_000) {
        let event: StockHistoryRow['event_type'] = 'check';
        if (!inStock && rnd() < 0.025 * rate) {
          inStock = true;
          event = 'restock';
          lastRestock = t;
        } else if (inStock && rnd() < 0.22) {
          inStock = false;
          event = 'sold_out';
        } else if (rnd() < 0.015) {
          prevPrice = price;
          price = Math.round(marketPrice(retailer, entry.msrp, rnd) * 100) / 100;
          if (price !== prevPrice) event = 'price_change';
        }
        const ts = t + Math.floor(rnd() * 3_600_000);
        if (ts > now) break;
        // Keep every event, but only every other routine check to keep the seed small.
        if (event !== 'check' || rnd() < 0.5) {
          history.push({
            product_id: id,
            retailer_id: retailer,
            price,
            stock_status: inStock ? 'in_stock' : 'out_of_stock',
            in_stock: inStock,
            event_type: event,
            data_source: 'simulated',
            latency_ms: 180 + Math.floor(rnd() * 1400),
            checked_at: new Date(ts).toISOString(),
          });
        }
      }

      const status: StockStatus = inStock ? (rnd() < 0.3 ? 'limited' : 'in_stock') : rnd() < 0.08 ? 'preorder' : 'out_of_stock';
      products.push({
        id,
        name: entry.name,
        category: entry.category,
        set_name: entry.set,
        language: entry.lang ?? 'EN',
        retailer_id: retailer,
        url: retailerSearchUrl(retailer, entry.name.replace('—', ' ')),
        external_id: null,
        image_url: null,
        msrp: entry.msrp,
        current_price: price,
        previous_price: prevPrice,
        stock_status: status,
        data_source: 'simulated',
        last_restock_at: lastRestock ? new Date(lastRestock).toISOString() : null,
        last_checked_at: new Date(now - Math.floor(rnd() * 600_000)).toISOString(),
        created_at: new Date(start).toISOString(),
      });
    }
  }
  history.sort((a, b) => a.checked_at.localeCompare(b.checked_at));
  return { products, history };
}

/** A starter set of tasks for a newly created account so the dashboard is not empty. */
export function buildStarterTasks(userId: string, products: Product[], now = Date.now()): MonitoringTask[] {
  const rnd = mulberry32(25);
  const pick = (name: string, retailer: RetailerId) =>
    products.find((p) => p.name.startsWith(name) && p.retailer_id === retailer);
  const wanted: [string, RetailerId, Partial<MonitoringTask>][] = [
    ['Prismatic Evolutions Elite', 'pokemon-center-ca', { frequency_sec: 120, quantity: 2, notify_telegram: true }],
    ['Prismatic Evolutions Elite', 'bestbuy-ca', { frequency_sec: 60, quantity: 2 }],
    ['Prismatic Evolutions Elite', 'walmart-ca', { frequency_sec: 60, quantity: 1 }],
    ['Scarlet & Violet—151 Elite', 'pokemon-center-ca', { frequency_sec: 120 }],
    ['Scarlet & Violet—151 Booster Bundle', 'gamestop-ca', { frequency_sec: 60, quantity: 3 }],
    ['Mega Evolution Elite', 'walmart-ca', { frequency_sec: 60 }],
    ['Mega Evolution Booster Box', 'gamestop-ca', { frequency_sec: 90 }],
    ['Destined Rivals Booster Box', 'amazon-ca', { frequency_sec: 60, max_price: 249.99 }],
    ['Surging Sparks Booster Box', 'amazon-ca', { frequency_sec: 60, data_source: 'live', max_price: 239.99 }],
    ['Charizard ex Super-Premium', 'costco-ca', { frequency_sec: 300 }],
    ['Phantasmal Flames Elite', 'bestbuy-ca', { frequency_sec: 60, quantity: 2 }],
    ['Terastal Festival ex', 'amazon-ca', { frequency_sec: 300, is_active: false, status: 'paused' }],
  ];
  const tasks: MonitoringTask[] = [];
  for (const [name, retailer, overrides] of wanted) {
    const p = pick(name, retailer);
    if (!p) continue;
    const created = new Date(now - (2 + rnd() * 10) * 86_400_000).toISOString();
    const freq = Math.max(overrides.frequency_sec ?? 60, RETAILER_MAP[retailer].min_interval_sec);
    tasks.push({
      id: randomUUID(),
      user_id: userId,
      product_id: p.id,
      product_name: p.name,
      product_url: p.url,
      retailer_id: retailer,
      max_price: overrides.max_price ?? Math.round((p.msrp ?? 100) * 1.1 * 100) / 100,
      quantity: 1,
      data_source: 'simulated',
      notify_discord: true,
      notify_browser: true,
      notify_email: false,
      notify_telegram: false,
      is_active: true,
      status: 'monitoring',
      last_checked_at: null,
      next_check_at: new Date(now + Math.floor(rnd() * 20_000)).toISOString(),
      last_price: p.current_price,
      last_in_stock: null,
      check_count: 0,
      restock_count: 0,
      consecutive_errors: 0,
      error_message: null,
      created_at: created,
      updated_at: created,
      ...overrides,
      frequency_sec: freq,
    });
  }
  return tasks;
}
