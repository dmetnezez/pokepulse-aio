'use client';

import clsx from 'clsx';
import { Bell, Mail, MessageCircle, Monitor, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { EmailWatchCard } from '@/components/EmailWatchCard';
import { useLive, useToast } from '@/components/LiveProvider';
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader, Panel, Spinner, Toggle } from '@/components/ui';
import { api, fmtDateTime, fmtDuration } from '@/lib/client';
import type { Channel, NotificationRow } from '@/lib/types';
import { FREQUENCIES } from '@/lib/validation';

interface Settings {
  alert_email: string | null;
  discord_webhook_url: string | null;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  browser_notifications: boolean;
  default_frequency_sec: number;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  discord_configured: boolean;
  telegram_configured: boolean;
  email_provider_configured: boolean;
}

const CHANNEL_ICON: Record<Channel, React.ReactNode> = {
  discord: <MessageCircle className="h-4 w-4" />,
  telegram: <Send className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  browser: <Monitor className="h-4 w-4" />,
};

export default function AlertsPage() {
  const toast = useToast();
  const { notificationPermission, requestNotificationPermission } = useLive();
  const { data, error, mutate } = useSWR<{ settings: Settings }>('/api/settings');
  const { data: notifs, mutate: refreshNotifs } = useSWR<{ notifications: NotificationRow[] }>('/api/notifications', { refreshInterval: 15_000 });
  const [form, setForm] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<Channel | null>(null);
  const [channelFilter, setChannelFilter] = useState<Channel | ''>('');

  useEffect(() => {
    if (data) setForm(data.settings);
  }, [data]);

  if (error) return <ErrorBlock error={error} retry={() => mutate()} />;
  if (!form) return <LoadingBlock />;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { settings } = await api<{ settings: Settings }>('/api/settings', {
        method: 'PUT',
        json: {
          alert_email: form.alert_email ?? '',
          discord_webhook_url: form.discord_webhook_url ?? '',
          telegram_bot_token: form.telegram_bot_token ?? '',
          telegram_chat_id: form.telegram_chat_id ?? '',
          browser_notifications: form.browser_notifications,
          default_frequency_sec: form.default_frequency_sec,
          quiet_hours_start: form.quiet_hours_start,
          quiet_hours_end: form.quiet_hours_end,
        },
      });
      await mutate({ settings }, { revalidate: false });
      toast({ kind: 'success', title: 'Alert settings saved' });
    } catch (err) {
      toast({ kind: 'error', title: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const test = async (channel: Channel) => {
    setTesting(channel);
    try {
      const { notification } = await api<{ notification: NotificationRow }>('/api/notifications/test', { method: 'POST', json: { channel } });
      if (notification.status === 'sent') toast({ kind: 'success', title: `Test ${channel} alert sent` });
      else toast({ kind: 'error', title: `Test ${channel} alert ${notification.status}`, body: notification.error ?? undefined });
      await refreshNotifs();
    } catch (err) {
      toast({ kind: 'error', title: (err as Error).message });
    } finally {
      setTesting(null);
    }
  };

  const list = (notifs?.notifications ?? []).filter((n) => !channelFilter || n.channel === channelFilter);

  return (
    <>
      <PageHeader title="Alerts" subtitle="Where restock alerts go, and everything that has been sent" />
      <EmailWatchCard />
      <div className="grid gap-6 xl:grid-cols-[440px_minmax(0,1fr)]">
        <form onSubmit={save} className="space-y-4">
          <ChannelCard icon={CHANNEL_ICON.discord} title="Discord webhook" configured={Boolean(data?.settings.discord_configured)} onTest={() => test('discord')} testing={testing === 'discord'}>
            <input
              className="input"
              placeholder="https://discord.com/api/webhooks/…"
              value={form.discord_webhook_url ?? ''}
              onChange={(e) => set('discord_webhook_url', e.target.value)}
            />
            <p className="mt-1 text-xs text-ink-400">Server Settings → Integrations → Webhooks → New Webhook → Copy URL.</p>
          </ChannelCard>

          <ChannelCard icon={CHANNEL_ICON.telegram} title="Telegram bot" configured={Boolean(data?.settings.telegram_configured)} onTest={() => test('telegram')} testing={testing === 'telegram'}>
            <div className="grid gap-2 md:grid-cols-2">
              <input className="input" placeholder="Bot token (from @BotFather)" value={form.telegram_bot_token ?? ''} onChange={(e) => set('telegram_bot_token', e.target.value)} />
              <input className="input" placeholder="Chat ID" value={form.telegram_chat_id ?? ''} onChange={(e) => set('telegram_chat_id', e.target.value)} />
            </div>
            <p className="mt-1 text-xs text-ink-400">Message your bot once, then use the chat ID from getUpdates.</p>
          </ChannelCard>

          <ChannelCard icon={CHANNEL_ICON.email} title="Email" configured={Boolean(form.alert_email && data?.settings.email_provider_configured)} onTest={() => test('email')} testing={testing === 'email'}>
            <input className="input" type="email" placeholder="you@example.com" value={form.alert_email ?? ''} onChange={(e) => set('alert_email', e.target.value)} />
            {!data?.settings.email_provider_configured && (
              <p className="mt-1 text-xs text-amber-300">The server has no email provider configured (RESEND_API_KEY) — email alerts will be skipped.</p>
            )}
          </ChannelCard>

          <ChannelCard icon={CHANNEL_ICON.browser} title="Browser notifications" configured={form.browser_notifications && notificationPermission === 'granted'} onTest={() => test('browser')} testing={testing === 'browser'}>
            <Toggle checked={form.browser_notifications} onChange={(v) => set('browser_notifications', v)} label="Show alerts in open PokéPulse tabs" />
            <div className="mt-2 text-xs text-ink-400">
              Permission: <span className="font-medium text-ink-200">{notificationPermission}</span>
              {notificationPermission === 'default' && (
                <button type="button" className="ml-2 text-volt-300 hover:text-volt-200" onClick={requestNotificationPermission}>
                  Grant permission
                </button>
              )}
              {notificationPermission === 'denied' && ' — re-enable in your browser’s site settings. In-app toasts still work.'}
            </div>
          </ChannelCard>

          <Panel title="Monitoring defaults">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="label">Default frequency</label>
                <select className="input" value={form.default_frequency_sec} onChange={(e) => set('default_frequency_sec', Number(e.target.value))}>
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {fmtDuration(f)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Quiet hours from</label>
                <HourSelect value={form.quiet_hours_start} onChange={(v) => set('quiet_hours_start', v)} />
              </div>
              <div>
                <label className="label">to (Eastern)</label>
                <HourSelect value={form.quiet_hours_end} onChange={(v) => set('quiet_hours_end', v)} />
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-400">During quiet hours only browser alerts are delivered; others are logged as skipped.</p>
          </Panel>

          <button className="btn-primary w-full" disabled={saving}>
            {saving && <Spinner />} Save alert settings
          </button>
          <p className="text-center text-xs text-ink-400">Test buttons use your saved settings — save first after editing.</p>
        </form>

        <Panel
          title="Notification history"
          action={
            <select className="input w-36 py-1 text-xs" value={channelFilter} onChange={(e) => setChannelFilter(e.target.value as Channel | '')}>
              <option value="">All channels</option>
              <option value="discord">Discord</option>
              <option value="telegram">Telegram</option>
              <option value="email">Email</option>
              <option value="browser">Browser</option>
            </select>
          }
          bodyClass="max-h-[900px] overflow-y-auto p-0"
        >
          {!notifs ? (
            <LoadingBlock />
          ) : list.length === 0 ? (
            <EmptyState icon={<Bell className="h-5 w-5" />} title="No alerts yet">
              Alerts appear here when a monitored product restocks within your max price. Use the test buttons to check your setup.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-ink-700/60">
              {list.map((n) => (
                <li key={n.id} className="flex gap-3 px-5 py-3">
                  <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-800 text-ink-300">{CHANNEL_ICON[n.channel]}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink-100">{n.title}</span>
                      <span
                        className={clsx(
                          'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                          n.status === 'sent' && 'bg-emerald-500/10 text-emerald-300',
                          n.status === 'failed' && 'bg-red-500/10 text-red-300',
                          n.status === 'skipped' && 'bg-ink-600/30 text-ink-300',
                          n.status === 'queued' && 'bg-surge-500/10 text-surge-300',
                        )}
                      >
                        {n.status}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-ink-400">
                      {fmtDateTime(n.created_at)} · <span className="capitalize">{n.channel}</span>
                      {n.error && <span className={n.status === 'failed' ? 'text-red-300' : ''}> · {n.error}</span>}
                    </div>
                    {typeof n.payload?.url === 'string' && (
                      <a href={n.payload.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-volt-300 hover:text-volt-200">
                        Product link →
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

function ChannelCard({ icon, title, configured, children, onTest, testing }: { icon: React.ReactNode; title: string; configured: boolean; children: React.ReactNode; onTest: () => void; testing: boolean }) {
  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink-100">
          <span className="text-volt-300">{icon}</span> {title}
          <span className={clsx('h-1.5 w-1.5 rounded-full', configured ? 'bg-emerald-400' : 'bg-ink-500')} title={configured ? 'Configured' : 'Not configured'} />
        </div>
        <button type="button" className="btn-ghost btn-sm" onClick={onTest} disabled={testing}>
          {testing ? <Spinner className="h-3 w-3" /> : <Send className="h-3 w-3" />} Send test
        </button>
      </div>
      {children}
    </section>
  );
}

function HourSelect({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}>
      <option value="">Off</option>
      {Array.from({ length: 24 }, (_, h) => (
        <option key={h} value={h}>
          {String(h).padStart(2, '0')}:00
        </option>
      ))}
    </select>
  );
}
