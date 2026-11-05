import type { Retailer, RetailerId } from './types';

/**
 * Canonical retailer registry. Integration status reflects what is *actually* wired up in this codebase,
 * not what the retailer may offer privately. Anything without an authorized integration runs on the
 * simulation engine and every data point it produces is labelled `simulated`.
 */
export const RETAILERS: Retailer[] = [
  {
    id: 'pokemon-center-ca',
    name: 'Pokémon Center Canada',
    domain: 'pokemoncenter.com',
    country: 'CA',
    integration_type: 'none',
    integration_status: 'not_available',
    integration_notes:
      'No public inventory API. Pokémon Center uses a virtual queue and bot protection on high-demand drops — PokéPulse will never bypass it. Simulated data only until an authorized feed exists.',
    min_interval_sec: 120,
    max_concurrency: 1,
    request_spacing_ms: 2000,
    brand_color: '#f5c518',
  },
  {
    id: 'walmart-ca',
    name: 'Walmart Canada',
    domain: 'walmart.ca',
    country: 'CA',
    integration_type: 'none',
    integration_status: 'not_available',
    integration_notes:
      'Walmart’s affiliate/marketplace APIs are not available for walmart.ca catalogue stock. Simulated data only.',
    min_interval_sec: 60,
    max_concurrency: 2,
    request_spacing_ms: 1000,
    brand_color: '#0071ce',
  },
  {
    id: 'bestbuy-ca',
    name: 'Best Buy Canada',
    domain: 'bestbuy.ca',
    country: 'CA',
    integration_type: 'none',
    integration_status: 'not_available',
    integration_notes:
      'The Best Buy developer API covers bestbuy.com (US) only. No authorized Canadian inventory API. Simulated data only.',
    min_interval_sec: 60,
    max_concurrency: 2,
    request_spacing_ms: 1000,
    brand_color: '#ffe000',
  },
  {
    id: 'gamestop-ca',
    name: 'GameStop Canada',
    domain: 'gamestop.ca',
    country: 'CA',
    integration_type: 'none',
    integration_status: 'not_available',
    integration_notes: 'No public product API. Simulated data only.',
    min_interval_sec: 60,
    max_concurrency: 2,
    request_spacing_ms: 1000,
    brand_color: '#e4002b',
  },
  {
    id: 'toysrus-ca',
    name: 'Toys R Us Canada',
    domain: 'toysrus.ca',
    country: 'CA',
    integration_type: 'none',
    integration_status: 'not_available',
    integration_notes: 'No public product API. Simulated data only.',
    min_interval_sec: 60,
    max_concurrency: 2,
    request_spacing_ms: 1000,
    brand_color: '#1e5bc6',
  },
  {
    id: 'costco-ca',
    name: 'Costco Canada',
    domain: 'costco.ca',
    country: 'CA',
    integration_type: 'none',
    integration_status: 'not_available',
    integration_notes: 'No public product API; many listings require membership sign-in. Simulated data only.',
    min_interval_sec: 120,
    max_concurrency: 1,
    request_spacing_ms: 2000,
    brand_color: '#e31837',
  },
  {
    id: 'amazon-ca',
    name: 'Amazon Canada',
    domain: 'amazon.ca',
    country: 'CA',
    integration_type: 'affiliate_api',
    integration_status: 'requires_credentials',
    integration_notes:
      'Live via the Amazon Product Advertising API (GetItems on webservices.amazon.ca). Requires an approved Amazon Associates account. Throttled to the API’s 1 request/second default.',
    min_interval_sec: 30,
    max_concurrency: 1,
    request_spacing_ms: 1100,
    brand_color: '#ff9900',
  },
];

export const RETAILER_MAP = Object.fromEntries(RETAILERS.map((r) => [r.id, r])) as Record<RetailerId, Retailer>;

export function retailerName(id: string): string {
  return RETAILER_MAP[id as RetailerId]?.name ?? id;
}

/** Guess the retailer from a product URL. */
export function detectRetailer(url: string): RetailerId | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host.endsWith('pokemoncenter.com')) return 'pokemon-center-ca';
  if (host.endsWith('walmart.ca')) return 'walmart-ca';
  if (host.endsWith('bestbuy.ca')) return 'bestbuy-ca';
  if (host.endsWith('gamestop.ca')) return 'gamestop-ca';
  if (host.endsWith('toysrus.ca')) return 'toysrus-ca';
  if (host.endsWith('costco.ca')) return 'costco-ca';
  if (host.endsWith('amazon.ca')) return 'amazon-ca';
  return null;
}

/** Extract an Amazon ASIN from a URL (/dp/ASIN, /gp/product/ASIN). */
export function extractAsin(url: string): string | null {
  const m = url.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?]|$)/i);
  return m ? m[1].toUpperCase() : null;
}
