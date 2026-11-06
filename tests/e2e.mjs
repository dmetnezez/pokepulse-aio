// End-to-end test: boots a production server on a throwaway data dir and drives the bot like a user.
//   npm run build && npm run test:e2e
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokepulse-e2e-'));
let cookie = '';
let failures = 0;
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function api(p, { method = 'GET', json, auth = true } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: { ...(json ? { 'content-type': 'application/json' } : {}), ...(auth && cookie ? { cookie } : {}) },
    body: json ? JSON.stringify(json) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return { status: res.status, body: await res.json().catch(() => null) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (await fetch(BASE + '/login').then(() => true).catch(() => false)) {
    console.error(`Port ${PORT} is already in use — stop that server first.`);
    process.exit(1);
  }
  // Run Next directly (not via npx) so killing this child really stops the server.
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], {
    env: { ...process.env, POKEPULSE_DATA_DIR: dataDir, SIMULATION_INTENSITY: '20', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => (log += d));
  server.stderr.on('data', (d) => (log += d));
  try {
    let up = false;
    for (let i = 0; i < 120 && !(up && log.includes('scheduler started')); i++) {
      await sleep(250);
      up = up || (await fetch(BASE + '/login').then((r) => r.ok).catch(() => false));
    }
    check('server boots and starts the monitor', up && log.includes('scheduler started'), up ? '' : log.slice(-300));

    // ── auth ──
    check('API rejects unauthenticated requests', (await api('/api/tasks', { auth: false })).status === 401);
    check('wrong password rejected', (await api('/api/auth/login', { method: 'POST', json: { email: 'demo@pokepulse.app', password: 'nope-nope' } })).status === 401);
    const email = `e2e-${Date.now()}@example.com`;
    const reg = await api('/api/auth/register', { method: 'POST', json: { email, password: 'trainer123', display_name: 'E2E', starter_tasks: false } });
    check('register new account', reg.status === 200 && reg.body?.user?.email === email);
    check('session works', (await api('/api/auth/me')).body?.user?.email === email);

    // ── catalogue ──
    const { body: cat } = await api('/api/products?retailer=amazon-ca');
    check('catalogue loads', cat?.products?.length > 5, `${cat?.products?.length} Amazon listings`);
    check('all catalogue data labelled simulated', cat.products.every((p) => p.data_source === 'simulated'));

    // ── task creation + validation ──
    const bad = await api('/api/tasks', { method: 'POST', json: { product_name: 'X ETB', product_url: 'https://example.com/x' } });
    check('unsupported retailer URL rejected', bad.status === 400, bad.body?.error);
    const clamp = await api('/api/tasks', {
      method: 'POST',
      json: { product_name: 'Test ETB', product_url: 'https://www.pokemoncenter.com/en-ca/product/e2e-test', frequency_sec: 15, category: 'etb' },
    });
    check('frequency clamped to retailer limit', clamp.body?.task?.frequency_sec === 120, clamp.body?.warnings?.[0]);

    // Watch every Amazon listing with no max price so any restock qualifies for an alert.
    const tasks = [];
    for (const p of cat.products.slice(0, 8)) {
      const r = await api('/api/tasks', { method: 'POST', json: { product_id: p.id, frequency_sec: 30, max_price: null, notify_discord: false, notify_browser: true } });
      if (r.status === 200) tasks.push(r.body.task);
    }
    check('created monitoring tasks', tasks.length === 8, `${tasks.length} tasks`);

    // ── live stream: wait for a restock to be detected and alerted ──
    const ctrl = new AbortController();
    const events = { activity: 0, task: 0, notification: [], log: 0 };
    const stream = fetch(BASE + '/api/stream', { headers: { cookie }, signal: ctrl.signal }).then(async (res) => {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const type = chunk.match(/^event: (\w+)/m)?.[1];
          const data = chunk.match(/^data: (.*)$/m)?.[1];
          if (!type || !data) continue;
          if (type === 'notification') events.notification.push(JSON.parse(data).notification);
          else if (type in events) events[type]++;
        }
      }
    }).catch(() => {});

    const started = Date.now();
    const browserAlert = () => events.notification.find((x) => x.channel === 'browser');
    while (Date.now() - started < 90_000 && (!browserAlert() || events.task < tasks.length)) {
      // nudge: queue an immediate check for any task not already in stock (still rate-limited per retailer)
      await api('/api/tasks/bulk', { method: 'POST', json: { ids: tasks.map((t) => t.id), action: 'check_now' } });
      await sleep(4000);
    }
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    check('live stream delivers task updates', events.task > 0, `${events.task} task events`);
    const n = browserAlert();
    check('restock detected and alert pushed live', Boolean(n), n ? `"${n.title}" after ${secs}s` : `none after ${secs}s`);
    const nonBrowser = events.notification.filter((x) => x.channel !== 'browser');
    if (nonBrowser.length) console.log(`      (other channels: ${nonBrowser.map((x) => `${x.channel}=${x.status}${x.error ? ` (${x.error})` : ''}`).join(', ')})`);
    if (n) {
      check('alert is browser channel, sent', n.channel === 'browser' && n.status === 'sent');
      check('alert labelled [SIMULATED]', n.title.startsWith('[SIMULATED]'));
      check('alert contains retailer, price, stock, link', /Retailer: .+/.test(n.body) && /Price: \$/.test(n.body) && /Stock: /.test(n.body) && /Link: https:\/\//.test(n.body));
    }
    ctrl.abort();
    await stream;

    const { body: after } = await api('/api/tasks');
    const restocked = after.tasks.filter((t) => t.status === 'restock_detected');
    check('task status reflects restock', restocked.length > 0, `${restocked.length} task(s) in "restock detected"`);
    check('tasks have been checked', after.tasks.filter((t) => t.check_count > 0).length >= 6);

    // ── purchase assistant ──
    const { body: pa } = await api('/api/purchase');
    const ready = pa.items.find((i) => i.ready);
    check('purchase assistant lists ready items', Boolean(ready));
    if (ready) {
      const r = await api('/api/purchase', { method: 'POST', json: { task_id: ready.task.id, product_id: ready.product.id, action: 'purchased', quantity: 2 } });
      check('log a purchase', r.status === 200);
      check('dashboard counts the purchase', (await api('/api/dashboard')).body.successfulPurchases === 2);
    }

    // ── task management ──
    const t0 = tasks[0];
    const dup = await api(`/api/tasks/${t0.id}/duplicate`, { method: 'POST' });
    check('duplicate task (starts paused)', dup.body?.task?.status === 'paused');
    check('pause task', (await api(`/api/tasks/${t0.id}`, { method: 'PATCH', json: { is_active: false } })).body?.task?.status === 'paused');
    check('resume task', (await api(`/api/tasks/${t0.id}`, { method: 'PATCH', json: { is_active: true } })).body?.task?.status === 'monitoring');
    check('delete task', (await api(`/api/tasks/${dup.body.task.id}`, { method: 'DELETE' })).status === 200);
    const hist = await api(`/api/tasks/${t0.id}`);
    check('task history has logs', hist.body?.logs?.length > 0, `${hist.body?.logs?.length} log lines`);

    // ── error path: live mode on a retailer with no authorized integration ──
    const bb = (await api('/api/products?retailer=bestbuy-ca')).body.products[0];
    const live = await api('/api/tasks', { method: 'POST', json: { product_id: bb.id, data_source: 'live', frequency_sec: 60 } });
    check('live-mode warning for unsupported retailer', live.body?.warnings?.some((w) => w.includes('no authorized live integration')));
    let errored = null;
    for (let i = 0; i < 20 && !errored; i++) {
      await sleep(1000);
      const t = (await api(`/api/tasks/${live.body.task.id}`)).body.task;
      if (t.status === 'error') errored = t;
    }
    check('task goes to error status with clear message', Boolean(errored), errored?.error_message?.slice(0, 80));

    // ── isolation ──
    const other = await (async () => {
      const saved = cookie;
      cookie = '';
      await api('/api/auth/register', { method: 'POST', json: { email: `other-${Date.now()}@example.com`, password: 'trainer123', display_name: 'Other', starter_tasks: false } });
      const r = await api(`/api/tasks/${t0.id}`);
      cookie = saved;
      return r.status;
    })();
    check("users can't read each other's tasks", other === 404);

    // ── inbox watcher: a pasted Pokémon Center email goes through the real pipeline ──
    const ws = await api('/api/settings', { method: 'PUT', json: { email_watch_enabled: true, imap_user: 'me@gmail.com', imap_password: 'abcd efgh ijkl mnop' } });
    check('inbox watcher settings saved, password masked', ws.body?.settings?.email_watch_enabled === true && ws.body.settings.imap_password === '••••••••');
    const badHost = await api('/api/settings', { method: 'PUT', json: { imap_host: 'not a host' } });
    check('invalid IMAP host rejected', badHost.status === 400);
    const drop = await api('/api/email-watch/test', {
      method: 'POST',
      json: { subject: "It's here! Pokémon Center exclusive drop", body: '<p>Shop now</p><a href="https://www.pokemoncenter.com/en-ca">Shop</a>' },
    });
    const dn = drop.body?.result?.notifications ?? [];
    check('drop email triggers alerts', drop.body?.result?.signal?.matched === true && dn.some((n) => n.channel === 'browser' && n.status === 'sent'), dn.map((n) => `${n.channel}:${n.status}`).join(', '));
    check('drop alert never uses the email channel', !dn.some((n) => n.channel === 'email'));
    const spam = await api('/api/email-watch/test', { method: 'POST', json: { from: 'Shop <news@othershop.ca>', subject: 'Pokémon sale' } });
    check('non-Pokémon-Center email ignored', spam.body?.result?.signal?.matched === false && spam.body.result.notifications.length === 0);
    const conn = await api('/api/email-watch/check', { method: 'POST' });
    check('connection test reports a clear status', conn.status === 200 && typeof conn.body?.result?.status === 'string', conn.body?.result?.status);

    // ── real data only mode ──
    const rawBefore = new Set((await api('/api/tasks')).body.tasks.map((t) => t.id));
    check('real-only mode switches on', (await api('/api/settings', { method: 'PUT', json: { real_only: true } })).body?.settings?.real_only === true);
    const rd = (await api('/api/dashboard')).body;
    check('dashboard hides simulated data', rd.realOnly === true && rd.simulatedShare === 0 && rd.recentActivity.every((a) => a.data_source !== 'simulated'),
      `${rd.recentActivity.length} real events`);
    const rp = (await api('/api/products')).body.products;
    check('products show no simulated stock or prices', rp.every((p) => p.data_source !== 'simulated' || (p.stock_status === 'unknown' && p.current_price === null)));
    const ra = (await api('/api/analytics?days=30')).body;
    check('analytics contain only real events', ra.totals.simulatedShare === 0 || ra.totals.observations === 0, `${ra.totals.observations} real observations`);
    const rt = (await api('/api/tasks')).body.tasks;
    check('tasks show how they are watched', rt.every((t) => ['email', 'api', 'none'].includes(t.watch)), [...new Set(rt.map((t) => t.watch))].join('/'));
    // Ask for immediate checks, wait, then compare the RAW check counters (real-only off) with before.
    await api('/api/tasks/bulk', { method: 'POST', json: { ids: rt.filter((t) => t.is_active).map((t) => t.id), action: 'check_now' } });
    await sleep(8000);
    const pcEmail = await api('/api/email-watch/test', { method: 'POST', json: { subject: "It's here! Pokémon Center exclusive drop", body: 'https://www.pokemoncenter.com/en-ca' } });
    check('real email still alerts in real-only mode', pcEmail.body?.result?.notifications?.some((n) => n.channel === 'browser' && n.status === 'sent'));
    await api('/api/settings', { method: 'PUT', json: { real_only: false } });
    const rawAfter = (await api('/api/tasks')).body.tasks.filter((t) => t.data_source === 'simulated' && rawBefore.has(t.id));
    // Switching real-only on wipes simulated counters to 0; if the simulator really stopped they stay 0.
    const advanced = rawAfter.filter((t) => t.check_count !== 0);
    check('simulator stopped for real-only user', rawAfter.length > 0 && advanced.length === 0, `${rawAfter.length} simulated tasks, ${advanced.length} were checked`);

    // ── analytics ──
    const an = (await api('/api/analytics?days=30')).body;
    check('analytics computes', an?.totals?.restocks > 0 && an.byRetailer.length === 7, `${an?.totals?.restocks} restocks in 30d`);

    check('no server errors logged', !/\[api\]|Unhandled|TypeError/.test(log), log.match(/.*(\[api\]|TypeError).*/)?.[0]);
  } finally {
    server.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  console.log(`\n${results.length - failures}/${results.length} checks passed`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
