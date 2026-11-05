import type { DataSource, RetailerId } from '../../types';
import { AmazonPaapiAdapter } from './amazon-paapi';
import { SimulatedAdapter } from './simulated';
import { IntegrationError, type RetailerAdapter } from './types';

export { IntegrationError } from './types';
export type { CheckResult, RetailerAdapter } from './types';

const simulated = new SimulatedAdapter();

/** Authorized live integrations, one per retailer. Add new ones here as they are approved. */
const LIVE: Partial<Record<RetailerId, RetailerAdapter>> = {
  'amazon-ca': new AmazonPaapiAdapter(),
};

export function resolveAdapter(retailer: RetailerId, source: DataSource): RetailerAdapter {
  if (source === 'simulated') return simulated;
  const live = LIVE[retailer];
  if (!live)
    throw new IntegrationError(
      'NOT_AVAILABLE',
      'No authorized live integration exists for this retailer yet. PokéPulse does not scrape or bypass bot protection — switch the task to simulated data.',
      false,
    );
  return live;
}

export function liveIntegrationStatus(): Record<string, { available: boolean; configured: boolean }> {
  const out: Record<string, { available: boolean; configured: boolean }> = {};
  for (const [id, adapter] of Object.entries(LIVE)) out[id] = { available: true, configured: adapter!.isConfigured() };
  return out;
}
