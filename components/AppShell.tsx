'use client';

import clsx from 'clsx';
import {
  Activity,
  BarChart3,
  Bell,
  Boxes,
  LayoutDashboard,
  ListChecks,
  LogOut,
  ScrollText,
  ShoppingCart,
  Store,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { api, fetcher } from '@/lib/client';
import { LiveProvider, useLive } from './LiveProvider';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tasks', label: 'Tasks', icon: ListChecks },
  { href: '/products', label: 'Products', icon: Boxes },
  { href: '/retailers', label: 'Retailers', icon: Store },
  { href: '/purchase', label: 'Purchase Assistant', icon: ShoppingCart },
  { href: '/alerts', label: 'Alerts', icon: Bell },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/logs', label: 'Logs', icon: ScrollText },
];

export interface ShellUser {
  id: string;
  email: string;
  display_name: string;
}

export function AppShell({ user, mode, children }: { user: ShellUser; mode: 'local' | 'supabase'; children: ReactNode }) {
  return (
    <SWRConfig value={{ fetcher, revalidateOnFocus: true, dedupingInterval: 1500, keepPreviousData: true }}>
      <LiveProvider>
        <div className="flex min-h-screen">
          <Sidebar user={user} mode={mode} />
          <div className="min-w-0 flex-1">
            <TopBar />
            <main className="mx-auto max-w-[1440px] px-4 pb-16 pt-6 md:px-8">{children}</main>
          </div>
        </div>
      </LiveProvider>
    </SWRConfig>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-volt-500 to-surge-600 shadow-glow">
        <Activity className="h-5 w-5 text-white" strokeWidth={2.5} />
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-bold tracking-tight text-white">
          PokéPulse <span className="bg-gradient-to-r from-volt-400 to-surge-400 bg-clip-text text-transparent">AIO</span>
        </div>
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-400">Restock monitor · CA</div>
      </div>
    </div>
  );
}

function Sidebar({ user, mode }: { user: ShellUser; mode: 'local' | 'supabase' }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-ink-700/70 bg-ink-900/70 px-4 py-5 backdrop-blur lg:flex">
      <Logo />
      <nav className="mt-8 flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                active ? 'bg-gradient-to-r from-volt-500/15 to-transparent text-white' : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100',
              )}
            >
              {active && <span className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-0.5 rounded-full bg-gradient-to-b from-volt-400 to-surge-400" />}
              <Icon className={clsx('h-4 w-4', active ? 'text-volt-300' : 'text-ink-400 group-hover:text-ink-200')} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-3">
        <div className="rounded-xl border border-ink-700 bg-ink-850 p-3 text-[11px] leading-relaxed text-ink-300">
          <div className="mb-1 font-semibold uppercase tracking-wider text-ink-200">{mode === 'local' ? 'Local demo mode' : 'Supabase connected'}</div>
          {mode === 'local'
            ? 'Data is stored in .data/ on this server. Configure Supabase for production.'
            : 'Auth and data are stored in your Supabase project.'}
        </div>
        <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-volt-600 to-surge-600 text-xs font-bold text-white">
            {(user.display_name || user.email).slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-ink-100">{user.display_name || 'Trainer'}</div>
            <div className="truncate text-[11px] text-ink-400">{user.email}</div>
          </div>
          <button onClick={logout} className="btn-ghost btn-sm" title="Sign out" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function TopBar() {
  const { connected, notificationPermission, requestNotificationPermission } = useLive();
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-ink-700/60 bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 md:px-8">
        <div className="lg:hidden">
          <Logo />
        </div>
        {/* mobile nav */}
        <nav className="flex gap-1 overflow-x-auto lg:hidden">
          {NAV.map(({ href, icon: Icon, label }) => (
            <Link key={href} href={href} title={label} className={clsx('rounded-md p-2', pathname === href ? 'bg-ink-800 text-white' : 'text-ink-400')}>
              <Icon className="h-4 w-4" />
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {notificationPermission === 'default' && (
            <button onClick={requestNotificationPermission} className="btn-secondary btn-sm">
              <Bell className="h-3.5 w-3.5" /> Enable browser alerts
            </button>
          )}
          <div
            className={clsx(
              'flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
              connected ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300',
            )}
            title={connected ? 'Receiving live updates over server-sent events' : 'Reconnecting to the live stream…'}
          >
            <span className={clsx('h-1.5 w-1.5 rounded-full', connected ? 'animate-pulseDot bg-emerald-400' : 'bg-amber-400')} />
            {connected ? 'Live' : 'Reconnecting'}
          </div>
        </div>
      </div>
    </header>
  );
}
