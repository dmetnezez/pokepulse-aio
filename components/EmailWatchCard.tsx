'use client';

import clsx from 'clsx';
import { CheckCircle2, ChevronDown, FlaskConical, Inbox, PlugZap, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/client';
import { useToast } from './LiveProvider';
import { Spinner, TimeAgo, Toggle } from './ui';

interface WatchSettings {
  email_watch_enabled: boolean;
  imap_host: string;
  imap_port: number;
  imap_user: string | null;
  imap_password: string | null;
  email_watch_senders: string;
  email_watch_keywords: string;
  email_watch_status: string | null;
  email_watch_checked_at: string | null;
  auto_open_links: boolean;
}

const PROVIDERS: Record<string, { host: string; port: number; help: string }> = {
  gmail: {
    host: 'imap.gmail.com',
    port: 993,
    help: 'Google Account → Security → turn on 2-Step Verification → search "App passwords" → create one named PokéPulse → paste the 16-letter code here.',
  },
  outlook: {
    host: 'outlook.office365.com',
    port: 993,
    help: 'Microsoft account → Security → Advanced security options → App passwords (requires two-step verification).',
  },
  yahoo: { host: 'imap.mail.yahoo.com', port: 993, help: 'Yahoo Account Info → Account security → Generate app password.' },
  icloud: { host: 'imap.mail.me.com', port: 993, help: 'appleid.apple.com → Sign-In and Security → App-Specific Passwords.' },
};

export function EmailWatchCard() {
  const toast = useToast();
  const { data, mutate } = useSWR<{ settings: WatchSettings }>('/api/settings', { refreshInterval: 15_000 });
  const [form, setForm] = useState<WatchSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'save' | 'check' | 'test' | null>(null);
  const [showTest, setShowTest] = useState(false);
  const [testSubject, setTestSubject] = useState("It's here! Prismatic Evolutions Elite Trainer Box is now available");
  const [testBody, setTestBody] = useState('The wait is over — shop now while supplies last: https://www.pokemoncenter.com/en-ca');
  const [lastTest, setLastTest] = useState<string | null>(null);

  useEffect(() => {
    if (data && !dirty) setForm(data.settings);
  }, [data, dirty]);

  if (!form) return null;
  const set = <K extends keyof WatchSettings>(k: K, v: WatchSettings[K]) => {
    setDirty(true);
    setForm((f) => (f ? { ...f, [k]: v } : f));
  };
  const provider = Object.entries(PROVIDERS).find(([, p]) => p.host === form.imap_host)?.[0] ?? 'other';
  const status = data?.settings.email_watch_status;
  const ok = status && !status.startsWith('Error');

  const save = async (enabled = form.email_watch_enabled) => {
    setBusy('save');
    try {
      const { settings } = await api<{ settings: WatchSettings }>('/api/settings', {
        method: 'PUT',
        json: {
          email_watch_enabled: enabled,
          imap_host: form.imap_host,
          imap_port: form.imap_port,
          imap_user: form.imap_user ?? '',
          imap_password: form.imap_password ?? '',
          email_watch_senders: form.email_watch_senders,
          email_watch_keywords: form.email_watch_keywords,
          auto_open_links: form.auto_open_links,
        },
      });
      setDirty(false);
      await mutate({ settings: { ...(data?.settings as WatchSettings), ...settings } }, { revalidate: true });
      return true;
    } catch (err) {
      toast({ kind: 'error', title: (err as Error).message });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const check = async () => {
    if (dirty && !(await save())) return;
    setBusy('check');
    try {
      const { result } = await api<{ result: { ok: boolean; status: string } }>('/api/email-watch/check', { method: 'POST' });
      toast(result.ok ? { kind: 'success', title: 'Inbox connected', body: result.status } : { kind: 'error', title: 'Inbox connection failed', body: result.status });
      await mutate();
    } catch (err) {
      toast({ kind: 'error', title: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const runTest = async () => {
    if (dirty && !(await save())) return;
    setBusy('test');
    try {
      const { result } = await api<{
        result: { opened?: string | null; signal: { matched: boolean; reason: string; url: string }; matchedTasks: { product_name: string }[]; notifications: { channel: string; status: string; error: string | null }[] };
      }>('/api/email-watch/test', { method: 'POST', json: { subject: testSubject, body: testBody } });
      const s = result.signal;
      setLastTest(
        s.matched
          ? `Matched → ${result.matchedTasks.length ? `task “${result.matchedTasks.map((t) => t.product_name).join('”, “')}”` : 'general drop alert'} · link ${s.url} · ` +
              result.notifications.map((n) => `${n.channel}: ${n.status}${n.error ? ` (${n.error})` : ''}`).join(', ') +
              (result.opened ? ` · opened ${result.opened} in your browser` : '')
          : `Not matched — ${s.reason}`,
      );
    } catch (err) {
      setLastTest((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel mb-6 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-700/70 bg-gradient-to-r from-amber-500/[0.07] to-transparent px-5 py-4">
        <div className="flex gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400/15 text-amber-300">
            <Inbox className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-white">Pokémon Center inbox watcher</h2>
            <p className="mt-0.5 max-w-2xl text-sm text-ink-300">
              Pokémon Center emails you when a drop goes live. PokéPulse checks your inbox every 20 seconds and fires a Discord / Telegram / browser alert
              the moment one arrives — read-only, nothing is marked read or deleted.
            </p>
          </div>
        </div>
        <Toggle
          checked={form.email_watch_enabled}
          disabled={busy !== null}
          onChange={async (v) => {
            set('email_watch_enabled', v);
            if (await save(v)) toast({ kind: 'success', title: v ? 'Inbox watcher on' : 'Inbox watcher off' });
          }}
          label={form.email_watch_enabled ? 'Watching' : 'Off'}
        />
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[150px_1fr]">
            <div>
              <label className="label">Provider</label>
              <select
                className="input"
                value={provider}
                onChange={(e) => {
                  const p = PROVIDERS[e.target.value];
                  if (p) {
                    set('imap_host', p.host);
                    set('imap_port', p.port);
                  }
                }}
              >
                <option value="gmail">Gmail</option>
                <option value="outlook">Outlook / Hotmail</option>
                <option value="yahoo">Yahoo</option>
                <option value="icloud">iCloud</option>
                <option value="other">Other (IMAP)</option>
              </select>
            </div>
            <div>
              <label className="label">Email address (the one subscribed to Pokémon Center)</label>
              <input className="input" type="email" placeholder="you@gmail.com" value={form.imap_user ?? ''} onChange={(e) => set('imap_user', e.target.value)} autoComplete="off" />
            </div>
          </div>
          <div>
            <label className="label">App password</label>
            <input
              className="input font-mono"
              type="password"
              placeholder="16-character app password — not your normal password"
              value={form.imap_password ?? ''}
              onFocus={() => form.imap_password?.startsWith('••••') && set('imap_password', '')}
              onChange={(e) => set('imap_password', e.target.value)}
              autoComplete="new-password"
            />
            <p className="mt-1 text-xs text-ink-400">{PROVIDERS[provider]?.help ?? 'Use your provider’s IMAP server and an app-specific password.'}</p>
          </div>
          {provider === 'other' && (
            <div className="grid grid-cols-[1fr_100px] gap-3">
              <div>
                <label className="label">IMAP server</label>
                <input className="input" value={form.imap_host} onChange={(e) => set('imap_host', e.target.value)} />
              </div>
              <div>
                <label className="label">Port</label>
                <input className="input" type="number" value={form.imap_port} onChange={(e) => set('imap_port', Number(e.target.value))} />
              </div>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">Alert on emails from</label>
              <input className="input" value={form.email_watch_senders} onChange={(e) => set('email_watch_senders', e.target.value)} />
              <p className="mt-1 text-xs text-ink-400">Comma-separated; matched against the sender.</p>
            </div>
            <div>
              <label className="label">Only if it mentions (optional)</label>
              <input className="input" placeholder="e.g. available, restock, it's here" value={form.email_watch_keywords} onChange={(e) => set('email_watch_keywords', e.target.value)} />
              <p className="mt-1 text-xs text-ink-400">Leave empty to alert on every Pokémon Center email.</p>
            </div>
          </div>
          <div className="rounded-lg border border-ink-700 bg-ink-900/60 p-3">
            <Toggle checked={form.auto_open_links} onChange={(v) => set('auto_open_links', v)} label="Auto-open the drop page in my browser" />
            <p className="mt-1.5 text-xs text-ink-400">
              When a drop email arrives, this computer opens the Pokémon Center page in your normal, logged-in browser — like clicking the link yourself.
              Only pokemoncenter.com links are ever opened. You do everything else (queue, cart, checkout).
            </p>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button className="btn-primary" disabled={busy !== null || !dirty} onClick={() => save()}>
              {busy === 'save' && <Spinner />} Save
            </button>
            <button className="btn-secondary" disabled={busy !== null || !form.imap_user} onClick={check}>
              {busy === 'check' ? <Spinner /> : <PlugZap className="h-4 w-4" />} Test connection
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className={clsx('rounded-xl border p-4', !status ? 'border-ink-700 bg-ink-900/60' : ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5')}>
            <div className="flex items-center gap-2 text-sm font-medium text-ink-100">
              {!status ? <Inbox className="h-4 w-4 text-ink-400" /> : ok ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
              {status ?? (form.email_watch_enabled ? 'Waiting for first check…' : 'Not connected yet')}
            </div>
            <div className="mt-1 text-xs text-ink-400">
              Last checked <TimeAgo iso={data?.settings.email_watch_checked_at} /> · alerts go to the Discord, Telegram and browser channels set up below (never back to email).
            </div>
          </div>

          <div className="rounded-xl border border-ink-700 bg-ink-900/60">
            <button className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-ink-100" onClick={() => setShowTest((s) => !s)}>
              <span className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-volt-300" /> Test with a sample or pasted email
              </span>
              <ChevronDown className={clsx('h-4 w-4 transition', showTest && 'rotate-180')} />
            </button>
            {showTest && (
              <div className="space-y-2 border-t border-ink-700 p-4">
                <input className="input" value={testSubject} onChange={(e) => setTestSubject(e.target.value)} placeholder="Subject" />
                <textarea className="input min-h-[90px] font-mono text-xs" value={testBody} onChange={(e) => setTestBody(e.target.value)} placeholder="Paste the email body (text or HTML)" />
                <button className="btn-secondary btn-sm" disabled={busy !== null} onClick={runTest}>
                  {busy === 'test' && <Spinner className="h-3 w-3" />} Run through the watcher
                </button>
                <p className="text-xs text-ink-400">Uses the real pipeline — matching tasks are marked “restock detected” and real alerts are sent.</p>
                {lastTest && <p className="break-all rounded-lg bg-ink-950 p-2 font-mono text-[11px] text-ink-200">{lastTest}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
