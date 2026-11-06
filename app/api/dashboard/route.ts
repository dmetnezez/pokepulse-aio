import { requireUser } from '@/lib/auth';
import { route } from '@/lib/http';
import { getScheduler } from '@/lib/monitor/scheduler';
import { dashboardStats, systemInfo } from '@/lib/services/stats';
import { isRealOnly } from '@/lib/mode';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const user = await requireUser();
  const sys = systemInfo();
  return {
    ...(await dashboardStats(user.id, await isRealOnly(user.id))),
    system: { ...sys, scheduler: sys.workerMode === 'embedded' ? getScheduler().stats() : null },
  };
});
