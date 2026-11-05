import type { Store } from './types';
import { LocalStore } from './local';
import { SupabaseStore } from './supabase';

export type { Store } from './types';

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Next.js may evaluate this module in several bundles (route handlers, instrumentation);
// pin the singleton to globalThis so they all share one store and one event bus.
const g = globalThis as unknown as { __pokepulseStore?: Store };

export function getStore(): Store {
  if (!g.__pokepulseStore) {
    g.__pokepulseStore = isSupabaseConfigured()
      ? new SupabaseStore(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      : new LocalStore();
  }
  return g.__pokepulseStore;
}
