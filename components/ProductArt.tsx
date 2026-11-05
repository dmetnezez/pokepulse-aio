import type { Category } from '@/lib/types';

/**
 * Generated product illustration. We don't hotlink retailer imagery; a live integration that returns
 * an image URL (e.g. Amazon PA-API) is shown instead when available.
 */
const PALETTES: [string, string][] = [
  ['#7c3aed', '#2563eb'],
  ['#db2777', '#7c3aed'],
  ['#0891b2', '#4f46e5'],
  ['#ea580c', '#be123c'],
  ['#16a34a', '#0e7490'],
  ['#ca8a04', '#c2410c'],
  ['#4338ca', '#0f172a'],
  ['#9333ea', '#be185d'],
];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const LABEL: Record<Category, string> = {
  etb: 'ETB',
  'booster-box': 'BOOSTER BOX',
  'booster-bundle': 'BUNDLE',
  'collection-box': 'COLLECTION',
  'premium-collection': 'PREMIUM',
  'pokemon-151': '151',
  'special-set': 'SPECIAL SET',
  japanese: 'JAPANESE',
};

export function ProductArt({ name, setName, category, imageUrl, className }: { name: string; setName: string; category: Category; imageUrl?: string | null; className?: string }) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt={name} className={`${className ?? ''} object-contain bg-white`} />;
  }
  const h = hash(setName || name);
  const [a, b] = PALETTES[h % PALETTES.length];
  const id = `g${h}`;
  const boxy = category === 'booster-box' || category === 'japanese';
  return (
    <svg viewBox="0 0 160 120" className={className} role="img" aria-label={name}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
        <radialGradient id={`${id}r`} cx="0.3" cy="0.2" r="0.9">
          <stop offset="0" stopColor="#fff" stopOpacity=".25" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="160" height="120" fill="#0b0c11" />
      <g transform={boxy ? 'translate(28 22)' : 'translate(40 14)'}>
        {/* box body */}
        <rect width={boxy ? 104 : 80} height={boxy ? 76 : 92} rx="6" fill={`url(#${id})`} />
        <rect width={boxy ? 104 : 80} height={boxy ? 76 : 92} rx="6" fill={`url(#${id}r)`} />
        <rect x="4" y="4" width={boxy ? 96 : 72} height={boxy ? 68 : 84} rx="4" fill="none" stroke="#fff" strokeOpacity=".25" />
        {/* stylised ball */}
        <g transform={`translate(${boxy ? 52 : 40} ${boxy ? 32 : 38})`}>
          <circle r="15" fill="#fff" fillOpacity=".92" />
          <path d="M-15 0a15 15 0 0 1 30 0z" fill="#111" fillOpacity=".85" />
          <rect x="-15" y="-1.5" width="30" height="3" fill="#111" />
          <circle r="5" fill="#fff" stroke="#111" strokeWidth="2.5" />
        </g>
        <text x={boxy ? 52 : 40} y={boxy ? 66 : 80} textAnchor="middle" fontSize="8" fontWeight="800" fill="#fff" letterSpacing="1" fontFamily="Inter, sans-serif">
          {LABEL[category]}
        </text>
      </g>
    </svg>
  );
}
