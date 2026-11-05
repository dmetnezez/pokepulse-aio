import { requireUser } from '@/lib/auth';
import { route } from '@/lib/http';
import { getStore } from '@/lib/store';
import { CATEGORIES, isAvailable, RETAILER_IDS, type Product } from '@/lib/types';

export const dynamic = 'force-dynamic';

const SORTS = {
  name: (a: Product, b: Product) => a.name.localeCompare(b.name),
  price_asc: (a: Product, b: Product) => (a.current_price ?? Infinity) - (b.current_price ?? Infinity),
  price_desc: (a: Product, b: Product) => (b.current_price ?? -1) - (a.current_price ?? -1),
  restock: (a: Product, b: Product) => (b.last_restock_at ?? '').localeCompare(a.last_restock_at ?? ''),
  stock: (a: Product, b: Product) => Number(isAvailable(b.stock_status)) - Number(isAvailable(a.stock_status)),
};

export const GET = route(async (req) => {
  const user = await requireUser();
  const sp = new URL(req.url).searchParams;
  const q = sp.get('q')?.trim().toLowerCase() ?? '';
  const category = sp.get('category');
  const retailer = sp.get('retailer');
  const status = sp.get('status'); // in_stock | out_of_stock
  const favOnly = sp.get('favourites') === '1';
  const sortKey = (sp.get('sort') ?? 'restock') as keyof typeof SORTS;

  const store = getStore();
  const [products, favs, tasks] = await Promise.all([store.listProducts(), store.listFavourites(user.id), store.listTasks(user.id)]);
  const favSet = new Set(favs);
  const watched = new Set(tasks.map((t) => t.product_id));

  const filtered = products
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.set_name.toLowerCase().includes(q))
    .filter((p) => !category || !(CATEGORIES as readonly string[]).includes(category) || p.category === category)
    .filter((p) => !retailer || !(RETAILER_IDS as readonly string[]).includes(retailer) || p.retailer_id === retailer)
    .filter((p) => !status || (status === 'in_stock' ? isAvailable(p.stock_status) : !isAvailable(p.stock_status)))
    .filter((p) => !favOnly || favSet.has(p.id))
    .sort(SORTS[sortKey] ?? SORTS.restock)
    .map((p) => ({ ...p, favourite: favSet.has(p.id), watched: watched.has(p.id) }));

  return { products: filtered, total: products.length };
});
