/**
 * Standalone monitoring worker.
 *
 *   WORKER_MODE=external npm run worker
 *
 * Use with the Supabase store so the web server and one worker share Postgres. The web process then
 * relays events to browsers by polling Postgres (see SupabaseStore.subscribe).
 */
import fs from 'node:fs';

for (const file of ['.env.local', '.env']) {
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

async function main() {
  const { getStore, isSupabaseConfigured } = await import('../lib/store');
  const { getScheduler } = await import('../lib/monitor/scheduler');

  if (!isSupabaseConfigured() && !process.argv.includes('--allow-local')) {
    console.error(
      '[worker] Supabase is not configured. The local JSON store is single-process only — ' +
        'run the embedded worker via `npm run dev` instead, or pass --allow-local if the web server is not running.',
    );
    process.exit(1);
  }

  const store = getStore();
  const scheduler = getScheduler();
  scheduler.start();
  const { startEmailWatchers } = await import('../lib/emailwatch/runner');
  startEmailWatchers();
  console.log(`[worker] running against ${store.kind} store`);

  setInterval(() => {
    const s = scheduler.stats();
    console.log(
      `[worker] checks/min=${s.checksLastMinute} errors/min=${s.errorsLastMinute} queued=${s.queued} inflight=${s.inflight}` +
        (s.lastError ? ` lastError="${s.lastError}"` : ''),
    );
  }, 60_000).unref();

  const shutdown = () => {
    console.log('[worker] shutting down');
    scheduler.stop();
    setTimeout(() => process.exit(0), 500);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
