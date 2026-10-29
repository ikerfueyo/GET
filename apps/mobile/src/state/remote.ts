/**
 * Reads and writes GET's Supabase tables (supabase/migrations). The catalogue
 * is public; everything else belongs to the signed-in user and row level
 * security keeps it theirs. Rows are mapped to the same types the shared
 * engine uses, so the rest of the app does not know where data came from.
 */
import * as Crypto from 'expo-crypto';
import {
  DEFAULT_LOCATIONS,
  DEMO_GET_CASH_USD,
  DEMO_PAYMENT_METHODS,
  OFFERS,
  loadCatalog,
  storeById,
  type Currency,
  type Mode,
  type Offer,
  type Order,
  type PaymentMethod,
  type Product,
  type SavedLocation,
  type Store,
} from '@get/shared';
import { supabase } from '../supabase';
import type { Cart } from './AppState';

export const newId = () => Crypto.randomUUID();

function db() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

/** throws the PostgREST error so callers can report it */
function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

// ───────────── Catalogue ─────────────

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const toStore = (r: Row): Store => ({
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

const toProduct = (r: Row): Product => ({
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

const toOffer = (r: Row): Offer => ({
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
async function all(table: string, columns = '*'): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const page = check(await db().from(table).select(columns).order('id').range(from, from + 999)) as unknown as Row[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

/**
 * Replaces the built-in catalogue with the database one. Returns false (and
 * keeps the built-in copy) when Supabase is off, unreachable or empty.
 */
export async function syncCatalog(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const [stores, products, offers] = await Promise.all([
      all('stores'),
      all('products', 'id, name, brand, category, description, tags, glyph, base_price_usd, requirements, is_service'),
      all('offers'),
    ]);
    if (!stores.length || !products.length || !offers.length) return false;
    loadCatalog({ stores: stores.map(toStore), products: products.map(toProduct), offers: offers.map(toOffer) });
    return true;
  } catch (e) {
    console.warn('Catalogue: using the built-in copy', e);
    return false;
  }
}

let catalog: Promise<boolean> | null = null;
/** starts loading the catalogue once; App calls it at launch so it loads during the loading screen */
export const catalogReady = () => (catalog ??= syncCatalog());

// ───────────── Account ─────────────

export interface Profile {
  fullName: string;
  username: string;
  phone: string;
  getCashUSD: number;
}

export interface Account {
  profile: Profile;
  locations: SavedLocation[];
  paymentMethods: PaymentMethod[];
  defaultPaymentId: string;
  carts: Cart[];
  orders: Order[];
}

const toLocation = (r: Row): SavedLocation => ({
  id: r.id,
  label: r.label,
  icon: r.icon,
  address: r.address,
  lat: r.lat,
  lng: r.lng,
  buildingType: r.building_type ?? undefined,
  details: r.details ?? undefined,
});

const toPayment = (r: Row): PaymentMethod => ({
  id: r.id,
  kind: r.kind,
  brand: r.brand,
  last4: r.last4,
  label: r.label,
  expMonth: r.exp_month ?? undefined,
  expYear: r.exp_year ?? undefined,
});

const toOrder = (r: Row): Order => {
  const pay = (r.payments as Row[])[0];
  return {
    id: r.id,
    storeId: r.store_id,
    storeName: storeById.get(r.store_id)?.name ?? 'Store',
    mode: r.mode,
    status: r.status,
    currency: r.currency,
    lines: (r.order_items as Row[]).map((i) => ({
      offerId: i.offer_id,
      productId: i.product_id,
      name: i.name,
      quantity: i.quantity,
      unitPrice: Number(i.unit_price),
    })),
    subtotal: Number(r.subtotal),
    fees: Number(r.fees),
    total: Number(r.total),
    paymentMethodId: pay?.payment_method_id ?? '',
    paymentLabel: pay?.payment_methods?.label ?? 'GET',
    deliverTo: r.deliver_to,
    placedAt: r.placed_at,
    etaAt: r.eta_at,
  };
};

/** a cart in the app is one store tab; in the database its mode lives on every item */
const toCart = (r: Row): Cart | null => {
  const items = r.cart_items as Row[];
  const storeId = OFFERS.find((o) => o.id === items[0]?.offer_id)?.storeId;
  if (!storeId) return null;
  return {
    id: r.id,
    name: r.name ?? undefined,
    storeId,
    mode: items[0].mode,
    lines: items.map((i) => ({ offerId: i.offer_id, quantity: i.quantity })),
    updatedAt: Date.parse(r.updated_at),
  };
};

/**
 * Loads the user's account, creating what a new account starts with: a profile
 * (also for users who signed up before the tables existed), the demo cards and
 * GET Cash, and the demo Home / Work / CDMX locations.
 */
export async function loadAccount(userId: string, fullName: string): Promise<Account> {
  const s = db();
  check(await s.from('profiles').upsert({ id: userId, full_name: fullName }, { onConflict: 'id', ignoreDuplicates: true }));

  const [profile, locations, payments, carts, orders] = await Promise.all([
    s.from('profiles').select('full_name, username, phone, get_cash_usd').eq('id', userId).single(),
    s.from('saved_locations').select('*').eq('user_id', userId).order('position'),
    s.from('payment_methods').select('*').eq('user_id', userId).order('created_at'),
    s.from('carts').select('id, name, updated_at, cart_items(offer_id, mode, quantity, created_at)').order('updated_at', { ascending: false }),
    s
      .from('orders')
      .select('*, order_items(*), payments(payment_method_id, payment_methods(label))')
      .eq('user_id', userId)
      .order('placed_at', { ascending: false })
      .limit(50),
  ]);

  let paymentRows = check(payments) as Row[];
  if (!paymentRows.length) {
    const seed = DEMO_PAYMENT_METHODS.map((pm, i) => ({
      id: newId(),
      user_id: userId,
      kind: pm.kind,
      brand: pm.brand,
      last4: pm.last4,
      label: pm.label,
      exp_month: pm.expMonth ?? null,
      exp_year: pm.expYear ?? null,
      is_default: i === 0,
    }));
    paymentRows = check(await s.from('payment_methods').insert(seed).select('*')) as Row[];
  }

  let locationRows = check(locations) as Row[];
  if (!locationRows.length) {
    const seed = DEFAULT_LOCATIONS.filter((l) => l.icon !== 'here').map((l, i) => ({
      id: newId(),
      user_id: userId,
      label: l.label,
      icon: l.icon,
      address: l.address,
      lat: l.lat,
      lng: l.lng,
      building_type: l.buildingType ?? null,
      details: l.details ?? null,
      position: i,
    }));
    locationRows = check(await s.from('saved_locations').insert(seed).select('*').order('position')) as Row[];
  }

  const p = check(profile) as Row;
  const methods = paymentRows.map(toPayment);
  return {
    profile: {
      fullName: p.full_name ?? fullName,
      username: p.username ?? '',
      phone: p.phone ?? '',
      getCashUSD: p.get_cash_usd == null ? DEMO_GET_CASH_USD : Number(p.get_cash_usd),
    },
    // "Here" is never stored: it follows the phone
    locations: [DEFAULT_LOCATIONS[0], ...locationRows.map(toLocation)],
    paymentMethods: methods,
    defaultPaymentId: paymentRows.find((r) => r.is_default)?.id ?? methods[0]?.id ?? '',
    carts: (check(carts) as Row[]).map(toCart).filter((c): c is Cart => !!c),
    orders: (check(orders) as Row[]).map(toOrder),
  };
}

// ───────────── Writes ─────────────

export async function updateProfile(userId: string, patch: Partial<Profile>) {
  const row: Row = {};
  if (patch.fullName !== undefined) row.full_name = patch.fullName;
  if (patch.username !== undefined) row.username = patch.username || null;
  if (patch.phone !== undefined) row.phone = patch.phone || null;
  if (patch.getCashUSD !== undefined) row.get_cash_usd = patch.getCashUSD;
  check(await db().from('profiles').update(row).eq('id', userId));
}

export async function insertLocation(userId: string, loc: SavedLocation, position: number) {
  check(
    await db().from('saved_locations').insert({
      id: loc.id,
      user_id: userId,
      label: loc.label,
      icon: loc.icon === 'here' ? 'pin' : loc.icon,
      address: loc.address,
      lat: loc.lat,
      lng: loc.lng,
      building_type: loc.buildingType ?? null,
      details: loc.details ?? null,
      position,
    }),
  );
}

export async function insertPaymentMethod(userId: string, pm: PaymentMethod) {
  check(
    await db().from('payment_methods').insert({
      id: pm.id,
      user_id: userId,
      kind: pm.kind,
      brand: pm.brand,
      last4: pm.last4,
      label: pm.label,
      exp_month: pm.expMonth ?? null,
      exp_year: pm.expYear ?? null,
    }),
  );
}

export async function setDefaultPaymentMethod(userId: string, id: string) {
  const s = db();
  check(await s.from('payment_methods').update({ is_default: false }).eq('user_id', userId).neq('id', id));
  check(await s.from('payment_methods').update({ is_default: true }).eq('id', id));
}

/** writes the whole cart: the cart row, the owner as a member, and its items */
export async function saveCart(userId: string, cart: Cart) {
  const s = db();
  check(await s.from('carts').upsert({ id: cart.id, owner_id: userId, name: cart.name ?? null, updated_at: new Date(cart.updatedAt).toISOString() }));
  check(await s.from('cart_members').upsert({ cart_id: cart.id, user_id: userId, role: 'owner', confirmed: true }, { ignoreDuplicates: true }));
  check(await s.from('cart_items').delete().eq('cart_id', cart.id));
  check(
    await s
      .from('cart_items')
      .insert(cart.lines.map((l) => ({ cart_id: cart.id, offer_id: l.offerId, mode: cart.mode, quantity: l.quantity, added_by: userId }))),
  );
}

export async function deleteCart(cartId: string) {
  check(await db().from('carts').delete().eq('id', cartId));
}

export async function insertOrder(userId: string, order: Order, cartId?: string) {
  const s = db();
  check(
    await s.from('orders').insert({
      id: order.id,
      user_id: userId,
      store_id: order.storeId,
      mode: order.mode,
      status: order.status,
      currency: order.currency,
      subtotal: order.subtotal,
      fees: order.fees,
      total: order.total,
      deliver_to: order.deliverTo,
      placed_at: order.placedAt,
      eta_at: order.etaAt,
    }),
  );
  check(
    await s.from('order_items').insert(
      order.lines.map((l) => ({ order_id: order.id, offer_id: l.offerId, product_id: l.productId, name: l.name, quantity: l.quantity, unit_price: l.unitPrice })),
    ),
  );
  check(
    await s.from('payments').insert({
      order_id: order.id,
      user_id: userId,
      payment_method_id: order.paymentMethodId || null,
      amount: order.total,
      currency: order.currency,
    }),
  );
  if (cartId) await deleteCart(cartId);
}
