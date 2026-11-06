/**
 * Real IMAP round-trip against a local test IMAP server (hoodiecrow): connects, reads only new mail,
 * never marks anything read, turns a Pokémon Center email into an alert and flips the matching task.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

process.env.POKEPULSE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pokepulse-imap-'));
delete process.env.NEXT_PUBLIC_SUPABASE_URL;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const hoodiecrow = require('hoodiecrow-imap');
const PORT = 31143;

type Server = { listen: (p: number, cb: () => void) => void; close: (cb: () => void) => void; appendMessage: (box: string, flags: string[], date: Date | false, raw: string) => void; getMailbox: (p: string) => { messages: { flags: string[] }[] } };
let server: Server;

const raw = (from: string, subject: string, body: string, date = new Date()) =>
  [`From: ${from}`, 'To: trainer@example.com', `Subject: ${subject}`, `Date: ${date.toUTCString()}`, `Message-ID: <${Math.random().toString(36).slice(2)}@test>`, 'Content-Type: text/plain; charset=utf-8', '', body].join('\r\n');

before(async () => {
  server = hoodiecrow({ plugins: ['ID', 'UNSELECT', 'ENABLE', 'IDLE'], users: { 'trainer@example.com': { password: 'app-password-123' } } });
  server.appendMessage('INBOX', [], false, raw('Pokémon Center <pokemoncenter@em.pokemoncenter.com>', 'Old drop from last week', 'old'));
  await new Promise<void>((r) => server.listen(PORT, r));
});

after(async () => {
  await new Promise<void>((r) => server.close(r));
  fs.rmSync(process.env.POKEPULSE_DATA_DIR!, { recursive: true, force: true });
});

test('inbox watcher end to end over IMAP', async () => {
  const { getStore } = await import('../lib/store');
  const { pollUser } = await import('../lib/emailwatch/runner');
  const store = getStore();
  const user = await store.createUser({ email: 'trainer@example.com', display_name: 'Trainer' });
  const settings = () => store.getSettings(user.id);
  const events: string[] = [];
  store.subscribe((e) => events.push(e.type === 'notification' ? `notification:${e.notification.channel}:${e.notification.status}` : e.type));

  // A Pokémon Center task the email should match.
  const product = (await store.listProducts()).find((p) => p.retailer_id === 'pokemon-center-ca' && p.name.startsWith('Prismatic Evolutions Elite'))!;
  const task = await store.createTask({
    user_id: user.id, product_id: product.id, product_name: product.name, product_url: product.url, retailer_id: 'pokemon-center-ca',
    max_price: null, quantity: 2, frequency_sec: 120, data_source: 'simulated', notify_discord: false, notify_browser: true, notify_email: true,
    notify_telegram: false, is_active: true, status: 'out_of_stock', last_checked_at: null, next_check_at: new Date(Date.now() + 3600_000).toISOString(),
    last_price: null, last_in_stock: false, check_count: 0, restock_count: 0, consecutive_errors: 0, error_message: null,
  });

  // Wrong password → clear error, nothing recorded.
  await store.updateSettings(user.id, { email_watch_enabled: true, imap_host: 'localhost', imap_port: PORT, imap_user: 'trainer@example.com', imap_password: 'wrong' });
  const bad = await pollUser(await settings());
  assert.equal(bad.ok, false);
  assert.match(bad.status, /Login failed|Error/);

  // First good poll: only records the newest UID — the old email must NOT alert.
  await store.updateSettings(user.id, { imap_password: 'app-password-123', email_watch_status: null, auto_open_links: true });
  const opened: string[] = [];
  (globalThis as { __pokepulseOpener?: (u: string) => void }).__pokepulseOpener = (u) => opened.push(u);
  const first = await pollUser(await settings());
  assert.equal(first.ok, true, first.status);
  assert.equal(first.lastUid, 1);
  assert.equal(first.alerts, 0);
  assert.equal(events.filter((e) => e.startsWith('notification')).length, 0);

  // Nothing new → no work.
  const idle = await pollUser(await settings());
  assert.equal(idle.processed, 0);

  // New mail arrives: one drop, one unrelated newsletter.
  server.appendMessage('INBOX', [], false, raw('Pokémon Center <pokemoncenter@em.pokemoncenter.com>', "It's here! Pokémon TCG: Prismatic Evolutions Pokémon Center Elite Trainer Box", 'Shop now: https://www.pokemoncenter.com/en-ca'));
  server.appendMessage('INBOX', [], false, raw('Some Store <news@othershop.ca>', 'Weekly deals', 'nothing to see'));
  const t0 = Date.now();
  const second = await pollUser(await settings());
  assert.equal(second.ok, true, second.status);
  assert.equal(second.processed, 2);
  assert.equal(second.alerts, 1);
  assert.equal(second.lastUid, 3);
  assert.ok(Date.now() - t0 < 5000, 'poll should be fast');

  // The matching task flipped, the product is marked in stock from an email, and a browser alert went out.
  const updated = (await store.getTask(task.id))!;
  assert.equal(updated.status, 'restock_detected');
  assert.equal(updated.restock_count, 1);
  const p = (await store.getProduct(product.id))!;
  assert.equal(p.stock_status, 'in_stock');
  assert.equal(p.data_source, 'email');
  const notes = await store.listNotifications(user.id);
  assert.deepEqual(notes.map((n) => `${n.channel}:${n.status}`), ['browser:sent'], 'email channel must never be used (would loop back into the inbox)');
  assert.match(notes[0].title, /^Pokémon Center email: Prismatic Evolutions/);
  assert.ok(events.includes('activity') && events.includes('task'));

  // Auto-open fired exactly once, for the drop email only, with a pokemoncenter.com URL.
  assert.equal(opened.length, 1);
  assert.match(opened[0], /^https:\/\/www\.pokemoncenter\.com\//);

  // Read-only: nothing was marked \Seen.
  assert.ok(server.getMailbox('INBOX').messages.every((m) => !m.flags.includes('\\Seen')));

  // Status persisted for the UI.
  const s = await settings();
  assert.match(s.email_watch_status ?? '', /1 drop email/);
  assert.equal(s.email_watch_last_uid, 3);
});
