import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { HttpError, readJson, route } from '@/lib/http';
import { getStore } from '@/lib/store';

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { favourite } = z.object({ favourite: z.boolean() }).parse(await readJson(req));
  const store = getStore();
  if (!(await store.getProduct(id))) throw new HttpError(404, 'Product not found');
  await store.setFavourite(user.id, id, favourite);
  return { favourite };
});
