import { createHash, createHmac } from 'node:crypto';
import type { Product, StockStatus } from '../../types';
import { extractAsin } from '../../retailers';
import { IntegrationError, type CheckResult, type RetailerAdapter } from './types';

/**
 * Amazon.ca — Product Advertising API 5.0, GetItems operation.
 * Authorized integration: requires an approved Amazon Associates account (access key, secret key, partner tag).
 * Requests are signed with AWS Signature Version 4. Throughput is limited by the scheduler to the
 * API's default 1 TPS. Docs: https://webservices.amazon.com/paapi5/documentation/get-items.html
 *
 * NOTE: Amazon has been migrating offer data from `Offers` to `OffersV2`. We request OffersV2 and parse
 * both shapes defensively — verify against the current PA-API docs when you enable this integration.
 */
const HOST = 'webservices.amazon.ca';
const REGION = 'us-east-1';
const SERVICE = 'ProductAdvertisingAPI';
const TARGET = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems';

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const hmac = (key: Buffer | string, s: string) => createHmac('sha256', key).update(s, 'utf8').digest();

export function signPaapiRequest(opts: {
  accessKey: string;
  secretKey: string;
  body: string;
  path: string;
  amzDate: string; // YYYYMMDDTHHMMSSZ
}) {
  const dateStamp = opts.amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    'content-encoding': 'amz-1.0',
    'content-type': 'application/json; charset=utf-8',
    host: HOST,
    'x-amz-date': opts.amzDate,
    'x-amz-target': TARGET,
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((k) => `${k}:${headers[k]}\n`)
    .join('');
  const canonicalRequest = ['POST', opts.path, '', canonicalHeaders, signedHeaders, sha256(opts.body)].join('\n');
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', opts.amzDate, scope, sha256(canonicalRequest)].join('\n');
  const kDate = hmac('AWS4' + opts.secretKey, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${opts.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function mapAvailability(type: string | undefined, message: string | undefined): StockStatus {
  const t = (type ?? '').toUpperCase();
  const m = (message ?? '').toLowerCase();
  if (t === 'NOW' || t === 'IN_STOCK') return m.includes('only') && m.includes('left') ? 'limited' : 'in_stock';
  if (t === 'IN_STOCK_SCARCE' || m.includes('only') ) return 'limited';
  if (t.includes('PREORDER') || m.includes('pre-order')) return 'preorder';
  if (t === 'OUT_OF_STOCK' || t === 'UNAVAILABLE' || m.includes('unavailable')) return 'out_of_stock';
  return t ? 'unknown' : 'out_of_stock';
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseGetItemsResponse(json: any): Omit<CheckResult, 'latencyMs' | 'source' | 'currency'> {
  if (json?.Errors?.length) {
    const e = json.Errors[0];
    if (e.Code === 'TooManyRequests') throw new IntegrationError('RATE_LIMITED', 'Amazon PA-API throttled the request (TooManyRequests)');
    if (e.Code === 'ItemNotAccessible' || e.Code === 'InvalidParameterValue')
      throw new IntegrationError('BAD_INPUT', `Amazon PA-API: ${e.Message ?? e.Code}`, false);
    throw new IntegrationError('UPSTREAM', `Amazon PA-API error ${e.Code}: ${e.Message ?? ''}`);
  }
  const item = json?.ItemsResult?.Items?.[0];
  if (!item) throw new IntegrationError('BAD_INPUT', 'Amazon PA-API returned no item for this ASIN', false);
  const listing = item.OffersV2?.Listings?.[0] ?? item.Offers?.Listings?.[0];
  if (!listing) return { status: 'out_of_stock', price: null, title: item.ItemInfo?.Title?.DisplayValue };
  const amount =
    listing.Price?.Money?.Amount ?? listing.Price?.Amount ?? (typeof listing.Price?.DisplayAmount === 'string'
      ? Number(listing.Price.DisplayAmount.replace(/[^0-9.]/g, ''))
      : null);
  return {
    status: mapAvailability(listing.Availability?.Type, listing.Availability?.Message),
    price: typeof amount === 'number' && Number.isFinite(amount) ? amount : null,
    title: item.ItemInfo?.Title?.DisplayValue,
    imageUrl: item.Images?.Primary?.Medium?.URL,
  };
}

export class AmazonPaapiAdapter implements RetailerAdapter {
  readonly id = 'amazon-paapi';
  readonly source = 'live' as const;
  readonly retailers = ['amazon-ca' as const];

  isConfigured() {
    return Boolean(process.env.AMAZON_PAAPI_ACCESS_KEY && process.env.AMAZON_PAAPI_SECRET_KEY && process.env.AMAZON_PAAPI_PARTNER_TAG);
  }

  async check(product: Product): Promise<CheckResult> {
    if (!this.isConfigured())
      throw new IntegrationError(
        'NOT_CONFIGURED',
        'Amazon PA-API credentials are not configured (AMAZON_PAAPI_ACCESS_KEY / SECRET_KEY / PARTNER_TAG). Switch this task to simulated data or add credentials.',
        false,
      );
    const asin = product.external_id ?? extractAsin(product.url);
    if (!asin)
      throw new IntegrationError('BAD_INPUT', 'Could not find an ASIN in the product URL. Use a link like https://www.amazon.ca/dp/B0XXXXXXXX', false);

    const body = JSON.stringify({
      ItemIds: [asin],
      ItemIdType: 'ASIN',
      PartnerTag: process.env.AMAZON_PAAPI_PARTNER_TAG,
      PartnerType: 'Associates',
      Marketplace: 'www.amazon.ca',
      Resources: ['ItemInfo.Title', 'Images.Primary.Medium', 'OffersV2.Listings.Price', 'OffersV2.Listings.Availability'],
    });
    const path = '/paapi5/getitems';
    const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const headers = signPaapiRequest({
      accessKey: process.env.AMAZON_PAAPI_ACCESS_KEY!,
      secretKey: process.env.AMAZON_PAAPI_SECRET_KEY!,
      body,
      path,
      amzDate,
    });

    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(`https://${HOST}${path}`, { method: 'POST', headers, body, signal: AbortSignal.timeout(8000) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new IntegrationError(msg.includes('abort') || msg.includes('timeout') ? 'TIMEOUT' : 'UPSTREAM', `Amazon PA-API request failed: ${msg}`);
    }
    const latencyMs = Date.now() - started;
    if (res.status === 429) throw new IntegrationError('RATE_LIMITED', 'Amazon PA-API rate limit hit (HTTP 429)');
    if (res.status === 401 || res.status === 403)
      throw new IntegrationError('NOT_CONFIGURED', `Amazon PA-API rejected the credentials (HTTP ${res.status})`, false);
    const json = await res.json().catch(() => null);
    if (!res.ok && !json?.Errors) throw new IntegrationError('UPSTREAM', `Amazon PA-API HTTP ${res.status}`);
    return { ...parseGetItemsResponse(json), currency: 'CAD', source: 'live', latencyMs };
  }
}
