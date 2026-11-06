import { requireUser } from '@/lib/auth';
import { route } from '@/lib/http';
import { pollUser } from '@/lib/emailwatch/runner';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Connect to the user's inbox right now and report the result ("Test connection"). */
export const POST = route(async () => {
  const user = await requireUser();
  const settings = await getStore().getSettings(user.id);
  const result = await pollUser(settings);
  return { result };
});
