/** How the customer gets the item: walk in, pick it up ready, or have it brought. */
export type Mode = 'in_store' | 'pickup' | 'delivery';

export const MODES: Mode[] = ['in_store', 'pickup', 'delivery'];

export const MODE_LETTER: Record<Mode, 'S' | 'P' | 'D'> = {
  in_store: 'S',
  pickup: 'P',
  delivery: 'D',
};

export const MODE_LABEL: Record<Mode, string> = {
  in_store: 'In-store',
  pickup: 'Pickup',
  delivery: 'Delivery',
};

export type Currency = 'USD' | 'MXN' | 'EUR' | 'GBP' | 'JPY';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Store extends LatLng {
  id: string;
  name: string;
  /** physical stores have a door; online stores only ship */
  kind: 'physical' | 'online';
  category: string;
  address: string;
  city: string;
  country: string;
  currency: Currency;
  rating: number;
  /** brand authenticity checkmark */
  verified: boolean;
  hasPickup: boolean;
  hasDelivery: boolean;
  /** local courier radius; beyond it the store only ships if shipsInternational */
  deliveryRadiusKm: number;
  shipsInternational: boolean;
  prepMinutes: number;
  hours: string;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  tags: string[];
  /** single character/emoji used as a placeholder image */
  glyph: string;
  /** reference price used to generate simulated offers */
  basePriceUSD: number;
  /** e.g. "ID required (21+)" */
  requirements: string[];
  isService: boolean;
}

export interface Offer {
  id: string;
  productId: string;
  storeId: string;
  /** in the store's currency */
  price: number;
  stock: number;
  /** inventory checkmark */
  inventoryVerified: boolean;
  modes: Mode[];
  /** in the store's currency */
  deliveryFee: number;
}

export interface SavedLocation extends LatLng {
  id: string;
  label: string;
  icon: 'here' | 'home' | 'work' | 'pin';
  address: string;
  buildingType?: 'House' | 'Apartment' | 'Office' | 'Hotel' | 'Other';
  details?: string;
}

export interface PaymentMethod {
  id: string;
  kind: 'card' | 'get_cash';
  brand: string;
  last4: string;
  label: string;
  expMonth?: number;
  expYear?: number;
}

export type OrderStatus = 'confirmed' | 'preparing' | 'on_the_way' | 'ready' | 'completed' | 'cancelled';

export interface OrderLine {
  offerId: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  storeId: string;
  storeName: string;
  mode: Mode;
  status: OrderStatus;
  currency: Currency;
  lines: OrderLine[];
  subtotal: number;
  fees: number;
  total: number;
  paymentMethodId: string;
  paymentLabel: string;
  deliverTo: SavedLocation;
  placedAt: string;
  etaAt: string;
}
