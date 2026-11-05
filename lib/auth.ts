import 'server-only';
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { getStore, isSupabaseConfigured } from './store';
import { buildStarterTasks } from './seed';
import { HttpError } from './http';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = 'pp_session';
const SESSION_TTL_MS = 14 * 86_400_000;

export interface SessionUser {
  id: string;
  email: string;
  display_name: string;
}

export const DEMO_ACCOUNT = { email: 'demo@pokepulse.app', password: 'pokepulse' };

// ─── local-mode helpers ────────────────────────────────────────────────────

let cachedSecret: string | null = null;
function sessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (cachedSecret) return cachedSecret;
  if (process.env.NODE_ENV === 'production') console.warn('[auth] SESSION_SECRET is not set — using a generated secret');
  const file = path.join(process.env.POKEPULSE_DATA_DIR ?? path.join(process.cwd(), '.data'), 'session-secret');
  try {
    cachedSecret = fs.readFileSync(file, 'utf8').trim();
  } catch {
    cachedSecret = randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, cachedSecret, { mode: 0o600 });
  }
  return cachedSecret;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltHex, keyHex] = stored.split('$');
  if (algo !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = await scrypt(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(keyHex, 'hex');
  return expected.length === key.length && timingSafeEqual(expected, key);
}

function signToken(userId: string): string {
  const payload = `${userId}.${Date.now() + SESSION_TTL_MS}`;
  const sig = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  const expected = createHmac('sha256', sessionSecret()).update(`${userId}.${exp}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  return userId;
}

/** Make sure the demo account exists in local mode so people can log in immediately. */
export async function ensureDemoAccount() {
  if (isSupabaseConfigured()) return;
  const store = getStore();
  if (await store.getUserByEmail(DEMO_ACCOUNT.email)) return;
  const user = await store.createUser({
    email: DEMO_ACCOUNT.email,
    display_name: 'Demo Trainer',
    password_hash: await hashPassword(DEMO_ACCOUNT.password),
  });
  await seedStarterTasks(user.id);
}

export async function seedStarterTasks(userId: string) {
  const store = getStore();
  const products = await store.listProducts();
  for (const t of buildStarterTasks(userId, products)) {
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = t;
    await store.createTask(rest);
  }
}

// ─── Supabase-mode helpers ─────────────────────────────────────────────────

function anonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface SbCookie {
  a: string; // access token
  r: string; // refresh token
}

// ─── public API ────────────────────────────────────────────────────────────

async function setSessionCookie(value: string) {
  (await cookies()).set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function signIn(email: string, password: string): Promise<SessionUser> {
  if (isSupabaseConfigured()) {
    const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) throw new HttpError(401, error?.message ?? 'Invalid email or password');
    await setSessionCookie(JSON.stringify({ a: data.session.access_token, r: data.session.refresh_token } satisfies SbCookie));
    const profile = await getStore().getUser(data.user.id);
    return { id: data.user.id, email: data.user.email ?? email, display_name: profile?.display_name ?? '' };
  }
  await ensureDemoAccount();
  const user = await getStore().getUserByEmail(email);
  if (!user?.password_hash || !(await verifyPassword(password, user.password_hash))) throw new HttpError(401, 'Invalid email or password');
  await setSessionCookie(signToken(user.id));
  return { id: user.id, email: user.email, display_name: user.display_name };
}

export async function signUp(email: string, password: string, displayName: string, starterTasks: boolean): Promise<SessionUser> {
  const store = getStore();
  if (isSupabaseConfigured()) {
    const { data, error } = await anonClient().auth.signUp({ email, password, options: { data: { display_name: displayName } } });
    if (error || !data.user) throw new HttpError(400, error?.message ?? 'Could not create account');
    await store.createUser({ id: data.user.id, email, display_name: displayName });
    if (starterTasks) await seedStarterTasks(data.user.id);
    if (!data.session) throw new HttpError(202, 'Account created — check your email to confirm it, then sign in.');
    await setSessionCookie(JSON.stringify({ a: data.session.access_token, r: data.session.refresh_token } satisfies SbCookie));
    return { id: data.user.id, email, display_name: displayName };
  }
  if (await store.getUserByEmail(email)) throw new HttpError(409, 'An account with that email already exists');
  const user = await store.createUser({ email, display_name: displayName, password_hash: await hashPassword(password) });
  if (starterTasks) await seedStarterTasks(user.id);
  await setSessionCookie(signToken(user.id));
  return { id: user.id, email: user.email, display_name: user.display_name };
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const store = getStore();

  if (isSupabaseConfigured()) {
    let parsed: SbCookie;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    const client = anonClient();
    let { data } = await client.auth.getUser(parsed.a);
    if (!data.user && parsed.r) {
      const refreshed = await client.auth.refreshSession({ refresh_token: parsed.r });
      if (refreshed.data.session && refreshed.data.user) {
        data = { user: refreshed.data.user };
        try {
          await setSessionCookie(JSON.stringify({ a: refreshed.data.session.access_token, r: refreshed.data.session.refresh_token }));
        } catch {
          /* cookies are read-only during server component render; the next API call will persist it */
        }
      }
    }
    if (!data.user) return null;
    const profile = await store.getUser(data.user.id);
    return { id: data.user.id, email: data.user.email ?? '', display_name: profile?.display_name ?? '' };
  }

  const userId = verifyToken(raw);
  if (!userId) return null;
  const user = await store.getUser(userId);
  return user ? { id: user.id, email: user.email, display_name: user.display_name } : null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, 'Not signed in');
  return user;
}
