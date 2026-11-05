import { requireUser } from '@/lib/auth';
import { route } from '@/lib/http';
import { checkNow } from '@/lib/services/tasks';

type Ctx = { params: Promise<{ id: string }> };

/** Queue an immediate check (the scheduler picks it up on its next tick, still subject to rate limits). */
export const POST = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return { task: await checkNow(user.id, id) };
});
