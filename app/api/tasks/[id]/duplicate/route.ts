import { requireUser } from '@/lib/auth';
import { route } from '@/lib/http';
import { duplicateTask } from '@/lib/services/tasks';

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return { task: await duplicateTask(user.id, id) };
});
