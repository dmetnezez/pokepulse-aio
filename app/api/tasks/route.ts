import { isRealOnly } from '@/lib/mode';
import { maskProduct, maskTask, realHistory } from '@/lib/realonly';
import { requireUser } from '@/lib/auth';
import { readJson, route } from '@/lib/http';
import { createTask } from '@/lib/services/tasks';
import { getStore } from '@/lib/store';
import { taskInputSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const user = await requireUser();
  const tasks = await getStore().listTasks(user.id);
  return { tasks: (await isRealOnly(user.id)) ? tasks.map(maskTask) : tasks };
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = taskInputSchema.parse(await readJson(req));
  return createTask(user.id, input);
});
