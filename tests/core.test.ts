import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseGetItemsResponse, signPaapiRequest } from '../lib/monitor/adapters/amazon-paapi';
import { IntegrationError } from '../lib/monitor/adapters/types';
import { resolveAdapter } from '../lib/monitor/adapters';
import { detectRetailer, extractAsin } from '../lib/retailers';
import { buildSeedCatalogue, buildStarterTasks } from '../lib/seed';
import { taskInputSchema } from '../lib/validation';
import { isValidDiscordWebhook } from '../lib/notify';
import { startOfTodayEastern } from '../lib/services/stats';

test('detectRetailer maps Canadian retailer domains', () => {
  assert.equal(detectRetailer('https://www.bestbuy.ca/en-ca/product/x/123'), 'bestbuy-ca');
  assert.equal(detectRetailer('https://www.pokemoncenter.com/en-ca/product/abc'), 'pokemon-center-ca');
  assert.equal(detectRetailer('https://www.amazon.ca/dp/B0D1234567'), 'amazon-ca');
  assert.equal(detectRetailer('https://www.amazon.com/dp/B0D1234567'), null);
  assert.equal(detectRetailer('not a url'), null);
});

test('extractAsin handles common Amazon URL shapes', () => {
  assert.equal(extractAsin('https://www.amazon.ca/Pokemon-ETB/dp/B0DLPL7LC5/ref=sr_1_1'), 'B0DLPL7LC5');
  assert.equal(extractAsin('https://www.amazon.ca/gp/product/b0dlpl7lc5?th=1'), 'B0DLPL7LC5');
  assert.equal(extractAsin('https://www.amazon.ca/s?k=pokemon'), null);
});

test('PA-API signing is deterministic and well-formed', () => {
  const opts = { accessKey: 'AKIDEXAMPLE', secretKey: 'secret', body: '{"a":1}', path: '/paapi5/getitems', amzDate: '20261105T120000Z' };
  const a = signPaapiRequest(opts);
  const b = signPaapiRequest(opts);
  assert.equal(a.authorization, b.authorization);
  assert.match(a.authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20261105\/us-east-1\/ProductAdvertisingAPI\/aws4_request, SignedHeaders=content-encoding;content-type;host;x-amz-date;x-amz-target, Signature=[0-9a-f]{64}$/);
  assert.notEqual(signPaapiRequest({ ...opts, body: '{"a":2}' }).authorization, a.authorization);
});

test('PA-API response parsing: OffersV2 and legacy Offers', () => {
  const v2 = parseGetItemsResponse({
    ItemsResult: { Items: [{ ASIN: 'B0', ItemInfo: { Title: { DisplayValue: 'ETB' } }, OffersV2: { Listings: [{ Price: { Money: { Amount: 79.99 } }, Availability: { Type: 'IN_STOCK', Message: 'In Stock' } }] } }] },
  });
  assert.deepEqual([v2.status, v2.price, v2.title], ['in_stock', 79.99, 'ETB']);
  const v1 = parseGetItemsResponse({ ItemsResult: { Items: [{ Offers: { Listings: [{ Price: { Amount: 54.5 }, Availability: { Type: 'Now', Message: 'Only 2 left in stock' } }] } }] } });
  assert.deepEqual([v1.status, v1.price], ['limited', 54.5]);
  const none = parseGetItemsResponse({ ItemsResult: { Items: [{ ASIN: 'B0' }] } });
  assert.equal(none.status, 'out_of_stock');
  assert.throws(() => parseGetItemsResponse({ Errors: [{ Code: 'TooManyRequests' }] }), (e: IntegrationError) => e.code === 'RATE_LIMITED' && e.retryable);
  assert.throws(() => parseGetItemsResponse({ Errors: [{ Code: 'ItemNotAccessible', Message: 'x' }] }), (e: IntegrationError) => e.code === 'BAD_INPUT' && !e.retryable);
});

test('live mode refuses retailers without an authorized integration', () => {
  assert.throws(() => resolveAdapter('bestbuy-ca', 'live'), (e: IntegrationError) => e.code === 'NOT_AVAILABLE' && !e.retryable);
  assert.equal(resolveAdapter('bestbuy-ca', 'simulated').source, 'simulated');
  assert.equal(resolveAdapter('amazon-ca', 'live').source, 'live');
});

test('seed catalogue is deterministic in shape, simulated, and covers every category', () => {
  const { products, history } = buildSeedCatalogue();
  assert.ok(products.length > 50);
  assert.ok(history.length > 1000);
  assert.ok(products.every((p) => p.data_source === 'simulated'));
  assert.ok(history.every((h) => h.data_source === 'simulated'));
  for (const c of ['etb', 'booster-box', 'booster-bundle', 'collection-box', 'premium-collection', 'pokemon-151', 'special-set', 'japanese'])
    assert.ok(products.some((p) => p.category === c), `missing ${c}`);
  const tasks = buildStarterTasks('u1', products);
  assert.ok(tasks.length >= 10);
  assert.ok(tasks.every((t) => t.user_id === 'u1'));
});

test('task input validation', () => {
  assert.equal(taskInputSchema.safeParse({}).success, false);
  assert.equal(taskInputSchema.safeParse({ product_name: 'X', product_url: 'http://www.bestbuy.ca/x' }).success, false); // https only
  assert.equal(taskInputSchema.safeParse({ product_name: 'XY', product_url: 'https://www.bestbuy.ca/x', quantity: 21 }).success, false);
  const ok = taskInputSchema.parse({ product_name: 'XY', product_url: 'https://www.bestbuy.ca/x', max_price: '89.99' });
  assert.equal(ok.max_price, 89.99);
  assert.equal(ok.frequency_sec, 60);
});

test('discord webhook validation', () => {
  assert.ok(isValidDiscordWebhook('https://discord.com/api/webhooks/1/abc'));
  assert.ok(!isValidDiscordWebhook('https://discord.com.evil.io/api/webhooks/1/abc'));
  assert.ok(!isValidDiscordWebhook('http://discord.com/api/webhooks/1/abc'));
});

test('startOfTodayEastern returns a past instant within 24h', () => {
  const now = new Date();
  const s = startOfTodayEastern(now);
  assert.ok(s <= now && now.getTime() - s.getTime() < 86_400_000);
});
