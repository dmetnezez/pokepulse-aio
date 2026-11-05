import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { readJson, route } from '@/lib/http';
import { buildAlert, dispatchAlert } from '@/lib/notify';
import { getStore } from '@/lib/store';

/** Send a test alert on one channel using a real catalogue product, so users can verify their setup. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { channel } = z.object({ channel: z.enum(['discord', 'browser', 'email', 'telegram']) }).parse(await readJson(req));
  const products = await getStore().listProducts();
  const product = products.find((p) => p.name.includes('Prismatic')) ?? products[0];
  const alert = buildAlert({ max_price: null, quantity: 1 }, product, 'test');
  const [row] = await dispatchAlert({ userId: user.id, task: null, productId: product.id, alert, channels: [channel] });
  return { notification: row };
});
