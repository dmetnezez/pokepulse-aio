import { requireUser } from '@/lib/auth';
import { route } from '@/lib/http';
import { systemInfo } from '@/lib/services/stats';

export const dynamic = 'force-dynamic';

export const GET = route(async () => ({ user: await requireUser(), system: systemInfo() }));
