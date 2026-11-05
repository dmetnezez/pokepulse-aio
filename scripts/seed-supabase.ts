/**
 * Seed a Supabase project with retailers, the sample catalogue, 30 days of simulated stock history,
 * and a demo account with starter tasks.
 *
 *   npm run seed:supabase
 */
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { RETAILERS } from '../lib/retailers';
import { buildSeedCatalogue, buildStarterTasks } from '../lib/seed';
import type { Product } from '../lib/types';

for (const file of ['.env.local', '.env']) if (fs.existsSync(file)) process.loadEnvFile(file);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

async function main() {
  console.log('→ retailers');
  await must(sb.from('retailers').upsert(RETAILERS), 'retailers');

  const existing = await must(sb.from('products').select('id').limit(1), 'products check');
  if (existing?.length) {
    console.log('Products already exist — skipping catalogue seed.');
  } else {
    const { products, history } = buildSeedCatalogue();
    console.log(`→ ${products.length} products`);
    await must(sb.from('products').insert(products), 'products');
    console.log(`→ ${history.length} stock history rows`);
    for (let i = 0; i < history.length; i += 1000) {
      await must(sb.from('stock_history').insert(history.slice(i, i + 1000)), 'stock_history');
    }
  }

  console.log('→ demo account demo@pokepulse.app');
  const { data: created, error } = await sb.auth.admin.createUser({
    email: 'demo@pokepulse.app',
    password: 'pokepulse',
    email_confirm: true,
    user_metadata: { display_name: 'Demo Trainer' },
  });
  if (error && !/already/i.test(error.message)) throw error;
  if (created?.user) {
    const products = await must(sb.from('products').select('*'), 'products');
    const tasks = buildStarterTasks(created.user.id, (products ?? []) as Product[]).map(({ id: _id, created_at: _c, updated_at: _u, ...t }) => t);
    await must(sb.from('monitoring_tasks').insert(tasks), 'tasks');
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
