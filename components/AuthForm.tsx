'use client';

import { Activity } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client';
import { Spinner, Toggle } from './ui';

export function AuthForm({ mode, demo }: { mode: 'login' | 'register'; demo: { email: string; password: string } | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [starter, setStarter] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e?: React.FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'login' || creds) {
        await api('/api/auth/login', { method: 'POST', json: creds ?? { email, password } });
      } else {
        await api('/api/auth/register', { method: 'POST', json: { email, password, display_name: name, starter_tasks: starter } });
      }
      const next = params.get('next');
      router.push(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
      router.refresh();
    } catch (err) {
      const msg = (err as Error).message;
      if ((err as { status?: number }).status === 202) setInfo(msg);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-volt-500 to-surge-600 shadow-glow">
            <Activity className="h-7 w-7 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            PokéPulse <span className="bg-gradient-to-r from-volt-400 to-surge-400 bg-clip-text text-transparent">AIO</span>
          </h1>
          <p className="mt-1 text-sm text-ink-300">Pokémon TCG restock monitoring for Canadian retailers</p>
        </div>
        <form onSubmit={submit} className="panel space-y-4 p-6">
          <h2 className="text-lg font-semibold text-white">{mode === 'login' ? 'Sign in' : 'Create your account'}</h2>
          {mode === 'register' && (
            <div>
              <label className="label" htmlFor="name">Display name</label>
              <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Ash" />
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          {mode === 'register' && <Toggle checked={starter} onChange={setStarter} label="Add a starter set of sample monitoring tasks" />}
          {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
          {info && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{info}</div>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy && <Spinner />} {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
          {mode === 'login' && demo && (
            <button type="button" className="btn-secondary w-full" disabled={busy} onClick={() => submit(undefined, demo)}>
              Try the demo account
            </button>
          )}
          <p className="text-center text-sm text-ink-300">
            {mode === 'login' ? (
              <>
                New here? <Link className="text-volt-300 hover:text-volt-200" href="/register">Create an account</Link>
              </>
            ) : (
              <>
                Already registered? <Link className="text-volt-300 hover:text-volt-200" href="/login">Sign in</Link>
              </>
            )}
          </p>
        </form>
        {demo && (
          <p className="mt-4 text-center text-xs text-ink-400">
            Local demo mode · demo login <span className="font-mono text-ink-300">{demo.email}</span> / <span className="font-mono text-ink-300">{demo.password}</span>
          </p>
        )}
      </div>
    </div>
  );
}
