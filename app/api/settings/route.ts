import { requireUser } from '@/lib/auth';
import { readJson, route } from '@/lib/http';
import { getStore } from '@/lib/store';
import type { UserSettings } from '@/lib/types';
import { settingsSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Secrets (webhook URL, bot token) are never sent back to the browser in full. */
function present(s: UserSettings) {
  const mask = (v: string | null) => (v ? `••••${v.slice(-4)}` : null);
  return {
    ...s,
    discord_webhook_url: mask(s.discord_webhook_url),
    telegram_bot_token: mask(s.telegram_bot_token),
    discord_configured: Boolean(s.discord_webhook_url),
    telegram_configured: Boolean(s.telegram_bot_token && s.telegram_chat_id),
    email_provider_configured: Boolean(process.env.RESEND_API_KEY),
  };
}

export const GET = route(async () => {
  const user = await requireUser();
  return { settings: present(await getStore().getSettings(user.id)) };
});

export const PUT = route(async (req) => {
  const user = await requireUser();
  const body = (await readJson(req)) as Record<string, unknown>;
  // Masked values coming back unchanged mean "keep the stored secret".
  for (const k of ['discord_webhook_url', 'telegram_bot_token']) {
    if (typeof body[k] === 'string' && (body[k] as string).startsWith('••••')) delete body[k];
  }
  const patch = settingsSchema.parse(body);
  return { settings: present(await getStore().updateSettings(user.id, patch)) };
});
