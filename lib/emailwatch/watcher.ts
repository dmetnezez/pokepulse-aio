import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { UserSettings } from '../types';
import { processDropEmail } from './process';

export interface PollResult {
  ok: boolean;
  status: string;
  lastUid: number | null;
  processed: number;
  alerts: number;
}

const MAX_PER_POLL = 25;
const MAX_MESSAGE_BYTES = 3 * 1024 * 1024;

/**
 * Check the user's inbox once for new mail (by UID, so nothing is ever marked read or changed).
 * On the very first run we only record the newest UID — old emails never trigger alerts.
 */
export async function pollInbox(settings: UserSettings): Promise<PollResult> {
  if (!settings.imap_user || !settings.imap_password)
    return { ok: false, status: 'Add your email address and app password first', lastUid: settings.email_watch_last_uid, processed: 0, alerts: 0 };

  const client = new ImapFlow({
    host: settings.imap_host,
    port: settings.imap_port,
    secure: settings.imap_port === 993,
    auth: { user: settings.imap_user, pass: settings.imap_password },
    logger: false,
    socketTimeout: 60_000,
    greetingTimeout: 15_000,
    connectionTimeout: 15_000,
  });
  client.on('error', () => {
    /* surfaced via the awaited calls below */
  });

  let lastUid = settings.email_watch_last_uid;
  let processed = 0;
  let alerts = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      if (!client.mailbox) throw new Error('Could not open INBOX');
      const mailbox = client.mailbox;
      const newest = mailbox.uidNext - 1;
      if (lastUid == null || lastUid > newest) {
        // First run (or the mailbox was rebuilt): start watching from now.
        return { ok: true, status: 'Connected — watching for new emails', lastUid: newest, processed: 0, alerts: 0 };
      }
      if (newest <= lastUid) return { ok: true, status: 'Connected — no new emails', lastUid, processed: 0, alerts: 0 };

      const from = Math.max(lastUid + 1, newest - MAX_PER_POLL + 1);
      const messages = (await client.fetchAll(`${from}:*`, { uid: true, size: true, source: true }, { uid: true })) ?? [];
      for (const msg of messages.sort((a, b) => a.uid - b.uid)) {
        if (msg.uid <= lastUid) continue; // "n:*" returns the newest message even when n is past it
        lastUid = msg.uid;
        if (!msg.source || (msg.size ?? msg.source.length) > MAX_MESSAGE_BYTES) continue;
        const parsed = await simpleParser(msg.source);
        const result = await processDropEmail(
          settings.user_id,
          {
            from: parsed.from?.text ?? '',
            subject: parsed.subject ?? '(no subject)',
            text: parsed.text ?? '',
            html: typeof parsed.html === 'string' ? parsed.html : null,
            date: parsed.date?.toISOString() ?? null,
            messageId: parsed.messageId ?? null,
          },
          settings,
        );
        processed++;
        if (result.signal.matched) alerts++;
      }
      lastUid = Math.max(lastUid, newest);
      return {
        ok: true,
        status: alerts ? `Connected — ${alerts} drop email(s) alerted` : `Connected — checked ${processed} new email(s)`,
        lastUid,
        processed,
        alerts,
      };
    } finally {
      lock.release();
    }
  } catch (err) {
    const e = err as { authenticationFailed?: boolean; responseText?: string; message?: string; code?: string };
    let status = e.responseText || e.message || String(err);
    if (e.authenticationFailed || /auth|credentials|password/i.test(status))
      status = 'Login failed — use an app password (Gmail: Google Account → Security → 2-Step Verification → App passwords)';
    else if (e.code === 'ENOTFOUND' || e.code === 'ECONNREFUSED' || e.code === 'ETIMEDOUT' || /timeout/i.test(status))
      status = `Can't reach ${settings.imap_host}:${settings.imap_port} (${e.code ?? 'timeout'})`;
    return { ok: false, status: `Error: ${status}`, lastUid, processed, alerts };
  } finally {
    await client.logout().catch(() => client.close());
  }
}
