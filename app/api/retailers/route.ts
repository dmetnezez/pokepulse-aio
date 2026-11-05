import { requireUser } from '@/lib/auth';
import { route } from '@/lib/http';
import { liveIntegrationStatus } from '@/lib/monitor/adapters';
import { getStore } from '@/lib/store';
import { isAvailable } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const user = await requireUser();
  const store = getStore();
  const [retailers, products, tasks] = await Promise.all([store.listRetailers(), store.listProducts(), store.listTasks(user.id)]);
  const live = liveIntegrationStatus();
  return {
    retailers: retailers.map((r) => {
      const listings = products.filter((p) => p.retailer_id === r.id);
      const myTasks = tasks.filter((t) => t.retailer_id === r.id);
      return {
        ...r,
        live: live[r.id] ?? { available: false, configured: false },
        listings: listings.length,
        inStock: listings.filter((p) => isAvailable(p.stock_status)).length,
        tasks: myTasks.length,
        activeTasks: myTasks.filter((t) => t.is_active).length,
        erroredTasks: myTasks.filter((t) => t.status === 'error').length,
        lastRestockAt: listings.map((p) => p.last_restock_at ?? '').sort().pop() || null,
      };
    }),
  };
});
