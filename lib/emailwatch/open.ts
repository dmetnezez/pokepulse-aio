import { spawn } from 'node:child_process';
import { DEFAULT_SHOP_URL } from './parse';

/**
 * Only ever auto-open Pokémon Center pages. A spoofed email can't make us open an arbitrary site:
 * anything else falls back to the Pokémon Center Canada homepage.
 */
export function safeOpenUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (u.protocol === 'https:' && (host === 'pokemoncenter.com' || host.endsWith('.pokemoncenter.com'))) return u.toString();
  } catch {
    /* fall through */
  }
  return DEFAULT_SHOP_URL;
}

const g = globalThis as unknown as { __pokepulseOpened?: Map<string, number>; __pokepulseOpener?: (url: string) => void };
const recent = (g.__pokepulseOpened ??= new Map());

function systemOpen(url: string) {
  // No shell involved: the URL is passed as a single argument.
  const [cmd, args] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
  child.on('error', (err) => console.error('[auto-open] could not open browser:', err.message));
  child.unref();
}

/** Open the drop page in the user's default browser (same as clicking the link). Max once per URL per 2 min. */
export function openInBrowser(url: string): { opened: boolean; url: string } {
  const safe = safeOpenUrl(url);
  const now = Date.now();
  if (now - (recent.get(safe) ?? 0) < 120_000) return { opened: false, url: safe };
  recent.set(safe, now);
  (g.__pokepulseOpener ?? systemOpen)(safe);
  return { opened: true, url: safe };
}
