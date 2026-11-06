import { requireUser } from '@/lib/auth';
import { readJson, route } from '@/lib/http';
import { processDropEmail } from '@/lib/emailwatch/process';
import { getStore } from '@/lib/store';
import { testEmailSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * Run a pasted email through the exact same pipeline as a real inbox email (matching, task updates,
 * alerts). Lets users confirm their filters and alert channels before a real drop.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  const input = testEmailSchema.parse(await readJson(req));
  const settings = await getStore().getSettings(user.id);
  const looksHtml = /<[a-z][\s\S]*>/i.test(input.body);
  const result = await processDropEmail(
    user.id,
    { from: input.from, subject: input.subject, text: looksHtml ? '' : input.body, html: looksHtml ? input.body : null, date: new Date().toISOString() },
    settings,
  );
  return { result };
});
