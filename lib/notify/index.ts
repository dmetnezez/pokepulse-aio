import type { Channel, MonitoringTask, NotificationRow, Product, StockStatus, UserSettings, DataSource } from '../types';
import { retailerName } from '../retailers';
import { getStore } from '../store';

export interface Alert {
  title: string;
  productName: string;
  retailer: string;
  price: number | null;
  maxPrice: number | null;
  quantity: number;
  status: StockStatus;
  url: string;
  source: DataSource;
  detectedAt: string;
}

const STATUS_TEXT: Record<StockStatus, string> = {
  in_stock: 'In stock',
  limited: 'Limited stock',
  out_of_stock: 'Out of stock',
  preorder: 'Pre-order',
  unknown: 'Unknown',
};

export const fmtCad = (n: number | null) => (n == null ? '—' : `$${n.toFixed(2)} CAD`);

export function buildAlert(
  task: Pick<MonitoringTask, 'max_price' | 'quantity'>,
  product: Product,
  kind: 'restock' | 'checkout' | 'test' = 'restock',
): Alert {
  const sim = product.data_source === 'simulated';
  const verb = kind === 'checkout' ? 'Checkout ready' : kind === 'test' ? 'Test alert' : 'Restock detected';
  return {
    title: `${sim ? '[SIMULATED] ' : ''}${verb}: ${product.name}`,
    productName: product.name,
    retailer: retailerName(product.retailer_id),
    price: product.current_price,
    maxPrice: task.max_price,
    quantity: task.quantity,
    status: product.stock_status,
    url: product.url,
    source: product.data_source,
    detectedAt: new Date().toISOString(),
  };
}

export function alertText(a: Alert): string {
  return [
    a.title,
    `Retailer: ${a.retailer}`,
    `Price: ${a.price == null ? 'see product page' : fmtCad(a.price)}${a.maxPrice != null ? ` (max ${fmtCad(a.maxPrice)})` : ''}`,
    `Stock: ${STATUS_TEXT[a.status]}`,
    `Quantity wanted: ${a.quantity}`,
    `Link: ${a.url}`,
    a.source === 'simulated'
      ? 'Data source: SIMULATED — not verified live inventory.'
      : a.source === 'email'
        ? 'Triggered by a Pokémon Center email — open the link fast, stock may already be in a queue.'
        : 'Data source: live retailer integration.',
  ].join('\n');
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
}

export function isValidDiscordWebhook(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)discord(app)?\.com$/.test(u.hostname) && u.pathname.startsWith('/api/webhooks/');
  } catch {
    return false;
  }
}

export async function sendDiscord(webhookUrl: string, a: Alert) {
  if (!isValidDiscordWebhook(webhookUrl)) throw new Error('Invalid Discord webhook URL');
  await postJson(webhookUrl, {
    username: 'PokéPulse AIO',
    embeds: [
      {
        title: a.title.slice(0, 250),
        url: a.url,
        color: a.source === 'simulated' ? 0x6b7280 : a.source === 'email' ? 0xf5c518 : 0x8b5cf6,
        fields: [
          { name: 'Retailer', value: a.retailer, inline: true },
          { name: 'Price', value: a.price == null ? 'See page' : fmtCad(a.price), inline: true },
          { name: 'Stock', value: STATUS_TEXT[a.status], inline: true },
          { name: 'Quantity wanted', value: String(a.quantity), inline: true },
          { name: 'Product link', value: `[Open retailer page](${a.url})` },
        ],
        footer: {
          text:
            a.source === 'simulated'
              ? 'SIMULATED data — not verified live inventory'
              : a.source === 'email'
                ? 'Triggered by a Pokémon Center email'
                : 'Live retailer integration',
        },
        timestamp: a.detectedAt,
      },
    ],
  });
}

export async function sendTelegram(token: string, chatId: string, a: Alert) {
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error('Invalid Telegram bot token format');
  const html = [
    `<b>${escapeHtml(a.title)}</b>`,
    `Retailer: ${escapeHtml(a.retailer)}`,
    `Price: ${a.price == null ? 'see product page' : fmtCad(a.price)}`,
    `Stock: ${STATUS_TEXT[a.status]} · qty ${a.quantity}`,
    `<a href="${escapeHtml(a.url)}">Open product page</a>`,
    a.source === 'simulated' ? '<i>Simulated data — not verified live inventory</i>' : a.source === 'email' ? '<i>Triggered by a Pokémon Center email</i>' : '',
  ].join('\n');
  await postJson(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: html,
    parse_mode: 'HTML',
  });
}

class SkipError extends Error {}

export async function sendEmail(to: string, a: Alert) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new SkipError('Email provider not configured on the server (set RESEND_API_KEY)');
  await postJson(
    'https://api.resend.com/emails',
    {
      from: process.env.ALERT_FROM_EMAIL ?? 'alerts@example.com',
      to: [to],
      subject: a.title,
      text: alertText(a),
    },
    { authorization: `Bearer ${key}` },
  );
}

function inQuietHours(s: UserSettings, now = new Date()): boolean {
  if (s.quiet_hours_start == null || s.quiet_hours_end == null) return false;
  const hour =
    Number(new Intl.DateTimeFormat('en-CA', { hour: 'numeric', hour12: false, timeZone: 'America/Toronto' }).format(now)) % 24;
  const a = s.quiet_hours_start;
  const b = s.quiet_hours_end;
  if (a === b) return false;
  return a < b ? hour >= a && hour < b : hour >= a || hour < b;
}

/**
 * Send an alert on every channel the task has enabled. Each attempt is recorded in `notifications`
 * (sent / failed / skipped) and pushed to the user's open dashboards over SSE.
 */
export async function dispatchAlert(opts: {
  userId: string;
  task: Pick<MonitoringTask, 'id' | 'notify_discord' | 'notify_browser' | 'notify_email' | 'notify_telegram'> | null;
  productId: string | null;
  alert: Alert;
  channels?: Channel[];
}): Promise<NotificationRow[]> {
  const store = getStore();
  const settings = await store.getSettings(opts.userId);
  const quiet = inQuietHours(settings);
  const t = opts.task;
  const channels: Channel[] =
    opts.channels ??
    ([
      t?.notify_discord && 'discord',
      t?.notify_browser && 'browser',
      t?.notify_email && 'email',
      t?.notify_telegram && 'telegram',
    ].filter(Boolean) as Channel[]);

  return Promise.all(
    channels.map(async (channel) => {
      let status: NotificationRow['status'] = 'sent';
      let error: string | null = null;
      try {
        if (quiet && channel !== 'browser') throw new SkipError('Quiet hours are active');
        switch (channel) {
          case 'discord':
            if (!settings.discord_webhook_url) throw new SkipError('No Discord webhook configured');
            await sendDiscord(settings.discord_webhook_url, opts.alert);
            break;
          case 'telegram':
            if (!settings.telegram_bot_token || !settings.telegram_chat_id)
              throw new SkipError('Telegram bot token / chat ID not configured');
            await sendTelegram(settings.telegram_bot_token, settings.telegram_chat_id, opts.alert);
            break;
          case 'email':
            if (!settings.alert_email) throw new SkipError('No alert email address configured');
            await sendEmail(settings.alert_email, opts.alert);
            break;
          case 'browser':
            if (!settings.browser_notifications) throw new SkipError('Browser notifications disabled in settings');
            break; // delivered to open dashboards via the SSE event below
        }
      } catch (err) {
        status = err instanceof SkipError ? 'skipped' : 'failed';
        error = err instanceof Error ? err.message : String(err);
      }
      const row = await store.addNotification({
        user_id: opts.userId,
        task_id: t?.id ?? null,
        product_id: opts.productId,
        channel,
        status,
        title: opts.alert.title,
        body: alertText(opts.alert),
        payload: { ...opts.alert },
        error,
      });
      store.publish({ type: 'notification', notification: row });
      if (status === 'failed') {
        const log = await store.addLog({
          user_id: opts.userId,
          task_id: t?.id ?? null,
          level: 'warn',
          message: `${channel} notification failed: ${error}`,
          context: { channel },
        });
        store.publish({ type: 'log', log });
      }
      return row;
    }),
  );
}
