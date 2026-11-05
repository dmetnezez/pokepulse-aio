import { requireUser } from '@/lib/auth';
import { readJson, route } from '@/lib/http';
import { createTask } from '@/lib/services/tasks';
import { getStore } from '@/lib/store';
import { taskInputSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const user = await requireUser();
  return { tasks: await getStore().listTasks(user.id) };
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = taskInputSchema.parse(await readJson(req));
  return createTask(user.id, input);
});
