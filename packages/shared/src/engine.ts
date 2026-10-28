/**
 * The "optimal offer" engine, following ranking design v1. For a query and a
 * location it looks at every offer of every matching product, works out each
 * way of getting it (in-store / pickup / delivery), and ranks them by real cost:
 *
 *   real cost = what you pay
 *             + your time   (hours you spend travelling × value of time)
 *             + waiting     (days until you have it × patience)
 *             + risk        (price × 2% unverified stock, 3% cross-border, 10% per star under 4.0)
 *
 * The list still shows the price you pay; real cost only decides the order.
 */
import { distanceKm, fromUSD, toUSD } from './geo';
import { OFFERS, PRODUCTS, STORES, storeById } from './seed';
import type { Currency, LatLng, Mode, Offer, Product, Store } from './types';

export type Preset = 'cheapest' | 'balanced' | 'soonest';

export const PRESETS: Record<Preset, { valueOfTime: number; patience: number }> = {
  cheapest: { valueOfTime: 0, patience: 0 },
  balanced: { valueOfTime: 20, patience: 3 },
  soonest: { valueOfTime: 60, patience: 30 },
};

export type SortKey = 'best' | 'price' | 'eta' | 'rating' | 'distance';

export interface SearchParams {
  query: string;
  location: LatLng;
  modes?: Mode[];
  sort?: SortKey;
  /** max distance for in-store and pickup */
  maxKm?: number;
  minRating?: number;
  maxPriceUSD?: number;
  /** only show what can be had today */
  urgent?: boolean;
  currency?: Currency;
  /** Cheapest (0, 0), Balanced (20 $/h, 3 $/day) or Soonest (60, 30); overrides below win */
  preset?: Preset;
  valueOfTimeUSDPerHour?: number;
  patienceUSDPerDay?: number;
  limit?: number;
  /** the shopper's country, for the cross-border risk term */
  fromCountry?: string;
}

export interface OfferOption {
  offerId: string;
  storeId: string;
  storeName: string;
  storeVerified: boolean;
  storeCity: string;
  storeKind: Store['kind'];
  storeCountry: string;
  /** one-way travel time to the store */
  travelMinutes?: number;
  mode: Mode;
  distanceKm: number;
  etaMinutes: number;
  rating: number;
  stock: number;
  inventoryVerified: boolean;
  /** in the store's currency */
  price: number;
  fee: number;
  storeCurrency: Currency;
  /** converted to the viewer's currency */
  total: number;
  currency: Currency;
  score: number;
}

export interface ProductResult {
  product: Product;
  best: OfferOption;
  /** availability of each mode across all offers */
  modes: Record<Mode, boolean>;
  options: OfferOption[];
  /** how well the product matched the query (higher is closer) */
  relevance: number;
}

const DEFAULT_MAX_KM = 40;

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function haystack(p: Product): string[] {
  return tokenize([p.name, p.brand, p.category, ...p.tags].join(' '));
}

/** Score how well a product matches a query; 0 means no match. */
export function matchScore(product: Product, query: string): number {
  const q = tokenize(query);
  if (q.length === 0) return 0;
  const words = haystack(product);
  let score = 0;
  for (const t of q) {
    if (words.includes(t)) score += 2;
    else if (words.some((w) => w.startsWith(t) || (w.length >= 4 && t.startsWith(w)))) score += 1;
    else return 0;
  }
  return score;
}

/** Work out every way to get an offer from a location. */
export function optionsForOffer(offer: Offer, from: LatLng, currency: Currency = 'USD'): OfferOption[] {
  const store = storeById.get(offer.storeId);
  if (!store) return [];
  const km = distanceKm(from, store);
  const out: OfferOption[] = [];
  const base = {
    offerId: offer.id,
    storeId: store.id,
    storeName: store.name,
    storeVerified: store.verified,
    storeCity: store.city,
    storeKind: store.kind,
    storeCountry: store.country,
    distanceKm: Math.round(km * 10) / 10,
    rating: store.rating,
    stock: offer.stock,
    inventoryVerified: offer.inventoryVerified,
    price: offer.price,
    storeCurrency: store.currency,
    currency,
    score: 0,
  };
  // walking under 1.5 km, otherwise ~30 km/h through a city
  const travelMin = km < 1.5 ? (km / 5) * 60 : 5 + (km / 30) * 60;

  for (const mode of offer.modes) {
    let eta: number;
    let fee = 0;
    if (mode === 'in_store') {
      if (km > DEFAULT_MAX_KM * 4) continue;
      eta = travelMin;
    } else if (mode === 'pickup') {
      if (km > DEFAULT_MAX_KM * 4) continue;
      eta = Math.max(store.prepMinutes, travelMin);
    } else {
      fee = offer.deliveryFee;
      if (store.kind === 'physical' && km <= store.deliveryRadiusKm) {
        eta = store.prepMinutes + 10 + (km / 25) * 60;
      } else if (store.shipsInternational || store.kind === 'online') {
        // parcel shipping: same region 2 days, same continent-ish 4, far 7
        const days = km < 800 ? 2 : km < 4000 ? 4 : 7;
        eta = days * 24 * 60;
        if (store.kind === 'physical') fee += store.currency === 'JPY' ? 3000 : fromUSD(19, store.currency);
      } else continue;
    }
    const total = fromUSD(toUSD(offer.price + fee, store.currency), currency);
    out.push({ ...base, mode, travelMinutes: Math.round(travelMin), etaMinutes: Math.round(eta), fee: Math.round(fee * 100) / 100, total: Math.round(total * 100) / 100 });
  }
  return out;
}

function scoreOption(o: OfferOption, valueOfTime: number, patience: number, from: string | undefined): number {
  const pay = toUSD(o.total, o.currency);
  // time you actually spend: the round trip for in-store and pickup
  const activeHours = o.mode === 'delivery' ? 0 : ((o.travelMinutes ?? 0) * 2) / 60;
  const waitDays = o.etaMinutes / (60 * 24);
  let riskRate = 0;
  if (!o.inventoryVerified) riskRate += 0.02;
  if (from && o.storeCountry !== from) riskRate += 0.03;
  if (o.rating < 4) riskRate += 0.1 * (4 - o.rating);
  return pay + activeHours * valueOfTime + waitDays * patience + pay * riskRate;
}

const sorters: Record<SortKey, (a: OfferOption, b: OfferOption) => number> = {
  best: (a, b) => a.score - b.score,
  price: (a, b) => a.total - b.total || a.etaMinutes - b.etaMinutes,
  eta: (a, b) => a.etaMinutes - b.etaMinutes || a.total - b.total,
  rating: (a, b) => b.rating - a.rating || a.score - b.score,
  distance: (a, b) => a.distanceKm - b.distanceKm || a.score - b.score,
};

/** Best guess of the shopper's country: the country of the closest physical store. */
export function countryNear(p: LatLng): string {
  let best = STORES[0];
  let bestKm = Infinity;
  for (const s of STORES) {
    if (s.kind !== 'physical') continue;
    const km = distanceKm(p, s);
    if (km < bestKm) [best, bestKm] = [s, km];
  }
  return best.country;
}

export function search(params: SearchParams): ProductResult[] {
  const {
    query,
    location,
    modes,
    sort = 'best',
    maxKm,
    minRating,
    maxPriceUSD,
    urgent,
    currency = 'USD',
    preset = 'balanced',
    valueOfTimeUSDPerHour = PRESETS[preset].valueOfTime,
    patienceUSDPerDay = PRESETS[preset].patience,
    fromCountry = countryNear(params.location),
    limit = 30,
  } = params;

  const matched = PRODUCTS.map((p) => ({ p, s: matchScore(p, query) }))
    .filter((m) => m.s > 0)
    .sort((a, b) => b.s - a.s);

  const results: ProductResult[] = [];
  for (const { p, s } of matched) {
    let options = OFFERS.filter((o) => o.productId === p.id).flatMap((o) => optionsForOffer(o, location, currency));
    const available = { in_store: false, pickup: false, delivery: false } as Record<Mode, boolean>;
    options.forEach((o) => (available[o.mode] = true));
    options = options.filter(
      (o) =>
        (!modes || modes.length === 0 || modes.includes(o.mode)) &&
        (maxKm === undefined || o.mode === 'delivery' || o.distanceKm <= maxKm) &&
        (minRating === undefined || o.rating >= minRating) &&
        (maxPriceUSD === undefined || toUSD(o.total, currency) <= maxPriceUSD) &&
        (!urgent || o.etaMinutes <= 12 * 60),
    );
    if (options.length === 0) continue;
    options.forEach((o) => (o.score = scoreOption(o, valueOfTimeUSDPerHour, patienceUSDPerDay, fromCountry)));
    options.sort(sorters[sort]);
    results.push({ product: p, best: options[0], modes: available, options, relevance: s });
  }
  // Closest matches first; within the same relevance, by the chosen sort of each product's best option.
  return results.sort((a, b) => b.relevance - a.relevance || sorters[sort](a.best, b.best)).slice(0, limit);
}

/** Autofill for the search bar: product names and tags that start with what was typed. */
export function suggest(prefix: string, limit = 6): string[] {
  const q = prefix.trim().toLowerCase();
  if (!q) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of PRODUCTS) {
    for (const cand of [p.name, ...p.tags]) {
      const c = cand.toLowerCase();
      if ((c.startsWith(q) || c.includes(' ' + q)) && !seen.has(c)) {
        seen.add(c);
        out.push(cand);
      }
    }
  }
  return out.sort((a, b) => a.length - b.length).slice(0, limit);
}
