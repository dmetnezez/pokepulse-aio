import { isRealOnly } from '@/lib/mode';
import { maskProduct, maskTask, realHistory } from '@/lib/realonly';
import { requireUser } from '@/lib/auth';
import { readJson, route } from '@/lib/http';
import { deleteTask, getOwnedTask, updateTask } from '@/lib/services/tasks';
import { getStore } from '@/lib/store';
import { taskPatchSchema } from '@/lib/validation';

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';

/** Task detail + its stock history and monitoring log ("task history"). */
export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const task = await getOwnedTask(user.id, id);
  const store = getStore();
  const [product, history, logs, notifications] = await Promise.all([
    store.getProduct(task.product_id),
    store.listStockHistory({ productId: task.product_id, since: new Date(Date.now() - 14 * 86_400_000).toISOString(), limit: 500 }),
    store.listLogs({ userId: user.id, taskId: id, limit: 100 }),
    store.listNotifications(user.id, 300).then((n) => n.filter((x) => x.task_id === id).slice(0, 50)),
  ]);
  if (await isRealOnly(user.id))
    return { task: maskTask(task), product: product && maskProduct(product), history: realHistory(history), logs, notifications };
  return { task, product, history, logs, notifications };
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const patch = taskPatchSchema.parse(await readJson(req));
  return { task: await updateTask(user.id, id, patch) };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  await deleteTask(user.id, id);
  return { ok: true };
});
