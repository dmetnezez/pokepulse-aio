import type { MonitoringTask } from '../types';

export interface IncomingEmail {
  from: string;
  subject: string;
  text: string;
  html?: string | null;
  date?: string | null;
  messageId?: string | null;
}

export interface DropSignal {
  matched: boolean;
  reason: string;
  from: string;
  subject: string;
  /** best link to open: a product page if the email has one, otherwise the email's main shop link */
  url: string;
  links: string[];
  snippet: string;
}

export const DEFAULT_SHOP_URL = 'https://www.pokemoncenter.com/en-ca';

const JUNK_LINK = /unsubscribe|optout|opt-out|privacy|preferences|manage|account|help|terms|legal|policy|view.?in.?browser|mailto:|facebook|twitter|instagram|youtube|tiktok|x\.com/i;

const splitList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

export function extractLinks(email: Pick<IncomingEmail, 'text' | 'html'>): string[] {
  const found = new Set<string>();
  const add = (raw: string) => {
    const url = raw.replace(/&amp;/g, '&').replace(/[)\].,>"']+$/, '');
    try {
      const u = new URL(url);
      if (u.protocol === 'https:' || u.protocol === 'http:') found.add(u.toString());
    } catch {
      /* not a URL */
    }
  };
  for (const m of (email.html ?? '').matchAll(/href\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  for (const m of (email.text ?? '').matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) add(m[0]);
  return [...found];
}

/** Rank links: direct product page > other pokemoncenter.com page > tracked pokemoncenter redirect. */
export function pickBestLink(links: string[]): string {
  let best: { url: string; score: number } = { url: DEFAULT_SHOP_URL, score: 0 };
  for (const url of links) {
    if (JUNK_LINK.test(url)) continue;
    let host: string;
    let path: string;
    try {
      const u = new URL(url);
      host = u.hostname.toLowerCase();
      path = u.pathname.toLowerCase();
    } catch {
      continue;
    }
    let score = 0;
    if (host.endsWith('pokemoncenter.com') && path.includes('/product/')) score = 3;
    else if (host.endsWith('pokemoncenter.com') && path.length > 1) score = 2;
    else if (host.includes('pokemoncenter')) score = 1;
    if (score > best.score) best = { url, score };
  }
  return best.url;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Decide whether an email is a drop announcement we should alert on. Pure — no I/O. */
export function parseDropEmail(email: IncomingEmail, opts: { senders: string; keywords: string }): DropSignal {
  const senders = splitList(opts.senders);
  const keywords = splitList(opts.keywords);
  const from = email.from.toLowerCase();
  const body = (email.text?.trim() ? email.text : htmlToText(email.html ?? '')).replace(/\s+/g, ' ').trim();
  const haystack = `${email.subject} ${body}`.toLowerCase();
  const links = extractLinks(email);
  const base = { from: email.from, subject: email.subject, url: pickBestLink(links), links, snippet: body.slice(0, 280) };

  if (senders.length && !senders.some((s) => from.includes(s))) return { ...base, matched: false, reason: 'Sender does not match the watch list' };
  if (keywords.length && !keywords.some((k) => haystack.includes(k)))
    return { ...base, matched: false, reason: `No keyword match (${keywords.join(', ')})` };
  return { ...base, matched: true, reason: 'Matched sender' + (keywords.length ? ' and keyword' : '') };
}

const STOP = new Set(['the', 'and', 'for', 'with', 'pokemon', 'pokémon', 'tcg', 'trading', 'card', 'game', 'scarlet', 'violet', 'box', 'ca', 'en']);

const tokens = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));

/**
 * Which of the user's tasks does this email refer to? A task matches if the email links to its exact
 * URL, or if nearly all the distinctive words in the task's product name appear in the email.
 */
export function matchTasks(signal: DropSignal, emailText: string, tasks: MonitoringTask[]): MonitoringTask[] {
  const words = new Set(tokens(`${signal.subject} ${emailText}`));
  return tasks.filter((t) => {
    if (signal.links.some((l) => l.split('?')[0] === t.product_url.split('?')[0])) return true;
    const want = [...new Set(tokens(t.product_name))];
    if (want.length < 2) return false;
    const hit = want.filter((w) => words.has(w)).length;
    return hit / want.length >= 0.8;
  });
}
