import { isRealOnly } from '@/lib/mode';
import { maskProduct, maskTask, realHistory } from '@/lib/realonly';
import { requireUser } from '@/lib/auth';
import { HttpError, readJson, route } from '@/lib/http';
import { buildAlert, dispatchAlert } from '@/lib/notify';
import { createTask, updateTask } from '@/lib/services/tasks';
import { getStore } from '@/lib/store';
import { isAvailable } from '@/lib/types';
import { purchaseSchema, taskInputSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Everything the purchase assistant needs: watched products with live availability + the user's activity. */
export const GET = route(async () => {
  const user = await requireUser();
  const store = getStore();
  const [rawTasks, activity, realOnly] = await Promise.all([store.listTasks(user.id), store.listPurchaseActivity(user.id, 100), isRealOnly(user.id)]);
  const tasks = realOnly ? rawTasks.map(maskTask) : rawTasks;
  const rawProducts = await store.getProductsByIds([...new Set(tasks.map((t) => t.product_id))]);
  const products = realOnly ? rawProducts.map(maskProduct) : rawProducts;
  const byId = new Map(products.map((p) => [p.id, p]));
  const items = tasks
    .map((t) => {
      const p = byId.get(t.product_id);
      if (!p) return null;
      const available = isAvailable(p.stock_status);
      const priceOk = t.max_price == null || p.current_price == null || p.current_price <= t.max_price;
      return { task: t, product: p, available, priceOk, ready: available && priceOk };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b!.ready) - Number(a!.ready) || Number(b!.available) - Number(a!.available));
  return { items, activity };
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = purchaseSchema.parse(await readJson(req));
  const store = getStore();
  const product = await store.getProduct(input.product_id);
  if (!product) throw new HttpError(404, 'Product not found');
  let task = input.task_id ? await store.getTask(input.task_id) : null;
  if (task && task.user_id !== user.id) throw new HttpError(404, 'Task not found');

  if (input.action === 'prepared' && task && task.quantity !== input.quantity) {
    task = await updateTask(user.id, task.id, { quantity: input.quantity });
  }

  let notified = false;
  let armed = false;
  if (input.action === 'checkout_ready') {
    if (isAvailable(product.stock_status)) {
      await dispatchAlert({
        userId: user.id,
        task: task ?? { id: '', notify_browser: true, notify_discord: true, notify_email: false, notify_telegram: false },
        productId: product.id,
        alert: buildAlert({ max_price: task?.max_price ?? null, quantity: input.quantity }, product, 'checkout'),
      });
      notified = true;
    } else {
      // Not available yet: make sure an active task is watching it so the restock alert fires.
      if (!task) {
        task = (
          await createTask(user.id, taskInputSchema.parse({ product_id: product.id, quantity: input.quantity, frequency_sec: 60 }))
        ).task;
      } else if (!task.is_active) {
        task = await updateTask(user.id, task.id, { is_active: true });
      }
      armed = true;
    }
  }

  const activity = await store.addPurchaseActivity({
    user_id: user.id,
    task_id: task?.id || null,
    product_id: product.id,
    action: armed ? 'prepared' : input.action,
    quantity: input.quantity,
    unit_price: input.unit_price ?? product.current_price,
    note: armed ? 'Armed — you will be alerted when checkout becomes available' : input.note ?? null,
  });
  return { activity, notified, armed, task };
});
