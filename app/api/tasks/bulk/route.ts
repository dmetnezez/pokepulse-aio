import { requireUser } from '@/lib/auth';
import { readJson, route } from '@/lib/http';
import { checkNow, deleteTask, updateTask } from '@/lib/services/tasks';
import { bulkSchema } from '@/lib/validation';

export const POST = route(async (req) => {
  const user = await requireUser();
  const { ids, action } = bulkSchema.parse(await readJson(req));
  const results = await Promise.allSettled(
    ids.map((id) => {
      switch (action) {
        case 'pause':
          return updateTask(user.id, id, { is_active: false });
        case 'resume':
          return updateTask(user.id, id, { is_active: true });
        case 'delete':
          return deleteTask(user.id, id);
        case 'check_now':
          return checkNow(user.id, id);
      }
    }),
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  return { ok: failed === 0, updated: ids.length - failed, failed };
});
