import { requireUser } from '@/lib/auth';
import { HttpError, route } from '@/lib/http';
import { getStore } from '@/lib/store';

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';

export const GET = route<Ctx>(async (req, { params }) => {
  await requireUser();
  const { id } = await params;
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get('days') ?? 30), 1), 90);
  const store = getStore();
  const product = await store.getProduct(id);
  if (!product) throw new HttpError(404, 'Product not found');
  const history = await store.listStockHistory({
    productId: id,
    since: new Date(Date.now() - days * 86_400_000).toISOString(),
    limit: 5000,
    desc: false,
  });
  return { product, history };
});
