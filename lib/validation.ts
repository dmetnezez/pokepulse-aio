import { z } from 'zod';
import { CATEGORIES, RETAILER_IDS } from './types';

export const FREQUENCIES = [15, 30, 60, 90, 120, 300, 600, 900, 1800, 3600] as const;

const money = z.coerce.number().positive().max(100_000).multipleOf(0.01).nullable();

export const taskInputSchema = z
  .object({
    product_id: z.string().uuid().optional(),
    product_name: z.string().trim().min(2).max(200).optional(),
    product_url: z.string().trim().url().max(2000).optional(),
    retailer_id: z.enum(RETAILER_IDS).optional(),
    category: z.enum(CATEGORIES).default('special-set'),
    max_price: money.optional().default(null),
    quantity: z.coerce.number().int().min(1).max(20).default(1),
    frequency_sec: z.coerce.number().int().min(15).max(86_400).default(60),
    data_source: z.enum(['simulated', 'live']).default('simulated'),
    notify_discord: z.boolean().default(true),
    notify_browser: z.boolean().default(true),
    notify_email: z.boolean().default(false),
    notify_telegram: z.boolean().default(false),
    is_active: z.boolean().default(true),
  })
  .refine((v) => v.product_id || (v.product_url && v.product_name), {
    message: 'Choose a catalogue product or provide a product name and URL',
    path: ['product_url'],
  })
  .refine((v) => !v.product_url || /^https:\/\//i.test(v.product_url), {
    message: 'Product URL must use https://',
    path: ['product_url'],
  });
export type TaskInput = z.infer<typeof taskInputSchema>;

export const taskPatchSchema = z
  .object({
    product_name: z.string().trim().min(2).max(200),
    max_price: money,
    quantity: z.coerce.number().int().min(1).max(20),
    frequency_sec: z.coerce.number().int().min(15).max(86_400),
    data_source: z.enum(['simulated', 'live']),
    notify_discord: z.boolean(),
    notify_browser: z.boolean(),
    notify_email: z.boolean(),
    notify_telegram: z.boolean(),
    is_active: z.boolean(),
  })
  .partial()
  .strict();

export const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(1000),
  action: z.enum(['pause', 'resume', 'delete', 'check_now']),
});

export const settingsSchema = z
  .object({
    alert_email: z.string().trim().email().nullable().or(z.literal('').transform(() => null)),
    discord_webhook_url: z
      .string()
      .trim()
      .url()
      .refine((u) => /^https:\/\/(\w+\.)?discord(app)?\.com\/api\/webhooks\//.test(u), 'Must be a Discord webhook URL')
      .nullable()
      .or(z.literal('').transform(() => null)),
    telegram_bot_token: z
      .string()
      .trim()
      .regex(/^\d+:[A-Za-z0-9_-]{20,}$/, 'Looks like an invalid bot token')
      .nullable()
      .or(z.literal('').transform(() => null)),
    telegram_chat_id: z
      .string()
      .trim()
      .regex(/^-?\d+$|^@\w+$/, 'Chat ID must be numeric or @channel')
      .nullable()
      .or(z.literal('').transform(() => null)),
    browser_notifications: z.boolean(),
    default_frequency_sec: z.coerce.number().int().min(15).max(86_400),
    quiet_hours_start: z.coerce.number().int().min(0).max(23).nullable(),
    quiet_hours_end: z.coerce.number().int().min(0).max(23).nullable(),
    email_watch_enabled: z.boolean(),
    imap_host: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'Enter a mail server host like imap.gmail.com'),
    imap_port: z.coerce.number().int().min(1).max(65535),
    imap_user: z.string().trim().max(200).nullable().or(z.literal('').transform(() => null)),
    imap_password: z
      .string()
      .transform((s) => s.replace(/\s+/g, '')) // Gmail shows app passwords in groups of four
      .pipe(z.string().max(200))
      .nullable()
      .or(z.literal('').transform(() => null)),
    email_watch_senders: z.string().trim().max(500),
    email_watch_keywords: z.string().trim().max(500),
    auto_open_links: z.boolean(),
  })
  .partial();

export const testEmailSchema = z.object({
  from: z.string().trim().max(300).default('Pokémon Center <pokemoncenter@em.pokemoncenter.com>'),
  subject: z.string().trim().min(1).max(500),
  body: z.string().max(100_000).default(''),
});

export const purchaseSchema = z.object({
  task_id: z.string().uuid().nullable().optional(),
  product_id: z.string().uuid(),
  action: z.enum(['opened_page', 'prepared', 'checkout_ready', 'purchased', 'cancelled']),
  quantity: z.coerce.number().int().min(1).max(20).default(1),
  unit_price: z.coerce.number().nonnegative().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export const credentialsSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

export const registerSchema = credentialsSchema.extend({
  display_name: z.string().trim().min(1).max(60),
  starter_tasks: z.boolean().default(true),
});
