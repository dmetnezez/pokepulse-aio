import { requireUser } from '@/lib/auth';
import { route } from '@/lib/http';
import { analytics } from '@/lib/services/stats';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  await requireUser();
  const days = Number(new URL(req.url).searchParams.get('days') ?? 30);
  return analytics([7, 14, 30, 60, 90].includes(days) ? days : 30);
});
