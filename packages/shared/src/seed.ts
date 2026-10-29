/**
 * The live catalogue and the demo account defaults. The catalogue lives in
 * Supabase (stores, products, offers); these arrays start empty and are filled
 * by loadCatalog() once it has been fetched (see db.ts).
 */
import type { Offer, PaymentMethod, Product, SavedLocation, Store } from './types';

export const STORES: Store[] = [];
export const PRODUCTS: Product[] = [];
export const OFFERS: Offer[] = [];

/** Locations for the Location Interface strip (LI 1). "Here" is replaced by GPS when available. */
export const DEFAULT_LOCATIONS: SavedLocation[] = [
  { id: 'loc_here', label: 'Here', icon: 'here', address: 'Chapel St, New Haven, CT', lat: 41.3083, lng: -72.9279 },
  { id: 'loc_home', label: 'Home', icon: 'home', address: '120 Howe St, New Haven, CT', lat: 41.3066, lng: -72.9365, buildingType: 'Apartment' },
  { id: 'loc_work', label: 'Work', icon: 'work', address: '1 Hillhouse Ave, New Haven, CT', lat: 41.3127, lng: -72.9224, buildingType: 'Office' },
  { id: 'loc_cdmx', label: 'CDMX', icon: 'pin', address: 'Polanco, Ciudad de México', lat: 19.4326, lng: -99.1937, buildingType: 'Hotel' },
];

/** Fake payment methods. Any Luhn-valid number works; see checkout.ts for test cards. */
export const DEMO_PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'pm_visa', kind: 'card', brand: 'Visa', last4: '4242', label: 'Visa ••••4242', expMonth: 12, expYear: 2030 },
  { id: 'pm_mc', kind: 'card', brand: 'Mastercard', last4: '4444', label: 'Mastercard ••••4444', expMonth: 8, expYear: 2029 },
  { id: 'pm_getcash', kind: 'get_cash', brand: 'GET Cash', last4: '', label: 'GET Cash' },
];

export const DEMO_GET_CASH_USD = 150;

export const storeById = new Map<string, Store>();
export const productById = new Map<string, Product>();

export interface Catalog {
  stores: Store[];
  products: Product[];
  offers: Offer[];
}

/**
 * Fill the catalogue, normally with what fetchCatalog() read from Supabase.
 * The arrays and maps are refilled in place so every module that imported
 * them sees the new data.
 */
export function loadCatalog(c: Catalog) {
  STORES.splice(0, STORES.length, ...c.stores);
  PRODUCTS.splice(0, PRODUCTS.length, ...c.products);
  OFFERS.splice(0, OFFERS.length, ...c.offers);
  storeById.clear();
  for (const s of STORES) storeById.set(s.id, s);
  productById.clear();
  for (const p of PRODUCTS) productById.set(p.id, p);
}
