import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractLinks, htmlToText, matchTasks, parseDropEmail, pickBestLink, DEFAULT_SHOP_URL } from '../lib/emailwatch/parse';
import type { MonitoringTask } from '../lib/types';

const PC_FROM = 'Pokémon Center <pokemoncenter@em.pokemoncenter.com>';
const opts = { senders: 'pokemoncenter.com', keywords: '' };

test('matches Pokémon Center sender, ignores others', () => {
  assert.equal(parseDropEmail({ from: PC_FROM, subject: "It's here!", text: 'Shop now' }, opts).matched, true);
  const other = parseDropEmail({ from: 'Deals <hello@randomshop.com>', subject: 'Pokémon ETB restock!', text: '' }, opts);
  assert.equal(other.matched, false);
  assert.match(other.reason, /Sender/);
});

test('optional keywords narrow matches', () => {
  const k = { senders: 'pokemoncenter.com', keywords: 'available, restock' };
  assert.equal(parseDropEmail({ from: PC_FROM, subject: 'Now available: Mega Evolution ETB', text: '' }, k).matched, true);
  assert.equal(parseDropEmail({ from: PC_FROM, subject: 'Your order has shipped', text: 'Tracking inside' }, k).matched, false);
});

test('link extraction prefers product pages and skips junk', () => {
  const html = `
    <a href="https://em.pokemoncenter.com/unsubscribe?u=1">Unsubscribe</a>
    <a href="https://click.em.pokemoncenter.com/?qs=abc">Shop</a>
    <a href="https://www.pokemoncenter.com/en-ca/product/290-85980/pokemon-tcg-etb">Product</a>
    <a href="https://www.facebook.com/pokemon">fb</a>`;
  const links = extractLinks({ text: '', html });
  assert.equal(links.length, 4);
  assert.equal(pickBestLink(links), 'https://www.pokemoncenter.com/en-ca/product/290-85980/pokemon-tcg-etb');
  // only a tracked redirect → use it
  assert.equal(pickBestLink(['https://click.em.pokemoncenter.com/?qs=abc', 'https://em.pokemoncenter.com/unsubscribe']), 'https://click.em.pokemoncenter.com/?qs=abc');
  // nothing usable → shop homepage
  assert.equal(pickBestLink(['https://www.facebook.com/x']), DEFAULT_SHOP_URL);
  // &amp; decoding
  assert.deepEqual(extractLinks({ text: '', html: '<a href="https://www.pokemoncenter.com/en-ca/category/new?a=1&amp;b=2">x</a>' }), [
    'https://www.pokemoncenter.com/en-ca/category/new?a=1&b=2',
  ]);
});

test('html body is used when there is no text part', () => {
  const r = parseDropEmail({ from: PC_FROM, subject: 'Drop', text: '', html: '<style>.x{}</style><p>Prismatic&nbsp;Evolutions <b>ETB</b></p>' }, opts);
  assert.equal(r.snippet, 'Prismatic Evolutions ETB');
  assert.equal(htmlToText('<div>a</div><div>b</div>'), 'a b');
});

const task = (name: string, url = 'https://www.pokemoncenter.com/en-ca/search/x'): MonitoringTask =>
  ({ id: name, product_name: name, product_url: url, retailer_id: 'pokemon-center-ca' }) as MonitoringTask;

test('emails are matched to the right tasks', () => {
  const tasks = [
    task('Prismatic Evolutions Elite Trainer Box'),
    task('Scarlet & Violet—151 Elite Trainer Box'),
    task('Mega Evolution Booster Bundle'),
  ];
  const s = parseDropEmail({ from: PC_FROM, subject: "It's here: Pokémon TCG: Prismatic Evolutions Pokémon Center Elite Trainer Box", text: '' }, opts);
  assert.deepEqual(
    matchTasks(s, '', tasks).map((t) => t.id),
    ['Prismatic Evolutions Elite Trainer Box'],
  );
  // "Elite Trainer Box" alone must not match every ETB task
  const generic = parseDropEmail({ from: PC_FROM, subject: 'New Elite Trainer Box collections', text: '' }, opts);
  assert.equal(matchTasks(generic, '', tasks).length, 0);
  // exact product URL in the email always matches
  const url = 'https://www.pokemoncenter.com/en-ca/product/123/x';
  const byUrl = parseDropEmail({ from: PC_FROM, subject: 'Hi', text: `go: ${url}?utm=1` }, opts);
  assert.equal(matchTasks(byUrl, '', [task('Something Else Entirely', url)]).length, 1);
});

test('auto-open only opens pokemoncenter.com https links, once per 2 min', async () => {
  const { safeOpenUrl, openInBrowser } = await import('../lib/emailwatch/open');
  assert.equal(safeOpenUrl('https://www.pokemoncenter.com/en-ca/product/1/x'), 'https://www.pokemoncenter.com/en-ca/product/1/x');
  assert.equal(safeOpenUrl('https://click.em.pokemoncenter.com/?qs=1'), 'https://click.em.pokemoncenter.com/?qs=1');
  assert.equal(safeOpenUrl('https://pokemoncenter.com.evil.io/x'), DEFAULT_SHOP_URL);
  assert.equal(safeOpenUrl('http://www.pokemoncenter.com/x'), DEFAULT_SHOP_URL);
  assert.equal(safeOpenUrl('javascript:alert(1)'), DEFAULT_SHOP_URL);
  const opened: string[] = [];
  (globalThis as { __pokepulseOpener?: (u: string) => void }).__pokepulseOpener = (u) => opened.push(u);
  assert.equal(openInBrowser('https://www.pokemoncenter.com/en-ca/product/9/y').opened, true);
  assert.equal(openInBrowser('https://www.pokemoncenter.com/en-ca/product/9/y').opened, false);
  assert.deepEqual(opened, ['https://www.pokemoncenter.com/en-ca/product/9/y']);
  delete (globalThis as { __pokepulseOpener?: unknown }).__pokepulseOpener;
});
