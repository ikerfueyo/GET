/**
 * Reads the catalogue from Supabase (supabase/migrations) for every app:
 * mobile, web and API pass in their own supabase-js client.
 */
import { loadCatalog, type Catalog } from './seed';
import type { Currency, Mode, Offer, Product, Store } from './types';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** the part of a supabase-js client this needs, so shared does not depend on it */
export interface CatalogClient {
  from(table: string): {
    select(columns: string): {
      order(column: string): {
        range(from: number, to: number): PromiseLike<{ data: unknown; error: { message: string } | null }>;
      };
    };
  };
}

export const storeFromRow = (r: Row): Store => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  category: r.category,
  address: r.address,
  city: r.city,
  country: r.country,
  currency: r.currency as Currency,
  lat: r.lat,
  lng: r.lng,
  rating: Number(r.rating),
  verified: r.verified,
  hasPickup: r.has_pickup,
  hasDelivery: r.has_delivery,
  deliveryRadiusKm: Number(r.delivery_radius_km),
  shipsInternational: r.ships_international,
  prepMinutes: r.prep_minutes,
  hours: r.hours,
});

export const productFromRow = (r: Row): Product => ({
  id: r.id,
  name: r.name,
  brand: r.brand,
  category: r.category,
  description: r.description,
  tags: r.tags,
  glyph: r.glyph,
  basePriceUSD: Number(r.base_price_usd),
  requirements: r.requirements,
  isService: r.is_service,
});

export const offerFromRow = (r: Row): Offer => ({
  id: r.id,
  productId: r.product_id,
  storeId: r.store_id,
  price: Number(r.price),
  stock: r.stock,
  inventoryVerified: r.inventory_verified,
  modes: r.modes as Mode[],
  deliveryFee: Number(r.delivery_fee),
});

/** PostgREST returns at most 1000 rows per request, so page through */
async function all(db: CatalogClient, table: string, columns = '*'): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).order('id').range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = data as Row[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

/** Reads the catalogue and loads it into STORES / PRODUCTS / OFFERS. Throws when it can't. */
export async function fetchCatalog(db: CatalogClient): Promise<Catalog> {
  const [stores, products, offers] = await Promise.all([
    all(db, 'stores'),
    // `search` is a generated tsvector, not needed in the apps
    all(db, 'products', 'id, name, brand, category, description, tags, glyph, base_price_usd, requirements, is_service'),
    all(db, 'offers'),
  ]);
  if (!stores.length || !products.length || !offers.length) throw new Error('The catalogue tables are empty. Run supabase/seed.sql.');
  const catalog = { stores: stores.map(storeFromRow), products: products.map(productFromRow), offers: offers.map(offerFromRow) };
  loadCatalog(catalog);
  return catalog;
}
