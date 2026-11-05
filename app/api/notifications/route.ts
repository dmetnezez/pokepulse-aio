import { requireUser } from '@/lib/auth';
import { route } from '@/lib/http';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const user = await requireUser();
  return { notifications: await getStore().listNotifications(user.id, 300) };
});
