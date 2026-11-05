import { requireUser } from '@/lib/auth';
import { route } from '@/lib/http';
import { getStore } from '@/lib/store';
import type { LogLevel } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  const user = await requireUser();
  const sp = new URL(req.url).searchParams;
  const level = sp.get('level') as LogLevel | null;
  return {
    logs: await getStore().listLogs({
      userId: user.id,
      taskId: sp.get('task') ?? undefined,
      level: level && ['debug', 'info', 'warn', 'error'].includes(level) ? level : undefined,
      limit: Math.min(Number(sp.get('limit') ?? 300), 1000),
    }),
  };
});
