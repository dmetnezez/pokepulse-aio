import type { UserSettings } from '../types';
import { getStore } from '../store';
import { pollInbox, type PollResult } from './watcher';

const INTERVAL_MS = Math.max(10, Number(process.env.EMAIL_WATCH_INTERVAL_SEC ?? 20)) * 1000;

const g = globalThis as unknown as { __pokepulseEmailTimer?: NodeJS.Timeout; __pokepulseEmailBusy?: Set<string> };
const busy = (g.__pokepulseEmailBusy ??= new Set());

/** Poll one user's inbox now and persist the outcome (status, last UID). */
export async function pollUser(settings: UserSettings): Promise<PollResult> {
  if (busy.has(settings.user_id)) return { ok: true, status: settings.email_watch_status ?? 'Check already running', lastUid: settings.email_watch_last_uid, processed: 0, alerts: 0 };
  busy.add(settings.user_id);
  const store = getStore();
  try {
    const result = await pollInbox(settings);
    await store.updateSettings(settings.user_id, {
      email_watch_last_uid: result.lastUid,
      email_watch_status: result.status,
      email_watch_checked_at: new Date().toISOString(),
    });
    // Log only when the connection state changes, so a broken login doesn't flood the log every 20s.
    const wasOk = !settings.email_watch_status?.startsWith('Error');
    if (result.ok !== wasOk || (!result.ok && result.status !== settings.email_watch_status)) {
      const log = await store.addLog({
        user_id: settings.user_id,
        task_id: null,
        level: result.ok ? 'info' : 'error',
        message: `Inbox watcher: ${result.status}`,
        context: { host: settings.imap_host },
      });
      store.publish({ type: 'log', log });
    }
    return result;
  } finally {
    busy.delete(settings.user_id);
  }
}

export function startEmailWatchers() {
  if (g.__pokepulseEmailTimer || process.env.EMAIL_WATCH === 'off') return;
  const tick = async () => {
    try {
      const all = await getStore().listEmailWatchSettings();
      await Promise.all(all.filter((s) => s.imap_user && s.imap_password).map((s) => pollUser(s)));
    } catch (err) {
      console.error('[email-watch] tick failed:', err);
    }
  };
  g.__pokepulseEmailTimer = setInterval(() => void tick(), INTERVAL_MS);
  void tick();
  console.log(`[email-watch] inbox watcher started (every ${INTERVAL_MS / 1000}s)`);
}
