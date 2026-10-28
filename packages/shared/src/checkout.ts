/**
 * Simulated purchases. No money moves: cards are checked for shape only
 * (Luhn + expiry) and a couple of test numbers trigger declines.
 */
import { toUSD } from './geo';
import { OFFERS, productById, storeById } from './seed';
import type { Mode, Order, OrderLine, PaymentMethod, SavedLocation } from './types';

/** Card numbers that always decline, for testing the unhappy path. */
export const DECLINE_CARDS = ['4000000000000002', '4000000000009995'];

export function luhnValid(number: string): boolean {
  const digits = number.replace(/\D/g, '');
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function cardBrand(number: string): string {
  const n = number.replace(/\D/g, '');
  if (/^4/.test(n)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'Mastercard';
  if (/^3[47]/.test(n)) return 'Amex';
  return 'Card';
}

export interface NewCardInput {
  number: string;
  expMonth: number;
  expYear: number;
  cvc: string;
  label?: string;
}

export function createFakeCard(input: NewCardInput, now = new Date()): PaymentMethod {
  const n = input.number.replace(/\D/g, '');
  if (!luhnValid(n)) throw new CheckoutError('invalid_card', 'That card number is not valid.');
  const expired =
    input.expYear < now.getFullYear() || (input.expYear === now.getFullYear() && input.expMonth < now.getMonth() + 1);
  if (expired) throw new CheckoutError('expired_card', 'That card has expired.');
  if (!/^\d{3,4}$/.test(input.cvc)) throw new CheckoutError('invalid_cvc', 'Check the security code.');
  const brand = cardBrand(n);
  const last4 = n.slice(-4);
  return {
    id: `pm_${brand.toLowerCase()}_${last4}_${now.getTime().toString(36)}`,
    kind: 'card',
    brand,
    last4,
    label: input.label ?? `${brand} ••••${last4}`,
    expMonth: input.expMonth,
    expYear: input.expYear,
  };
}

export class CheckoutError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface CheckoutInput {
  lines: { offerId: string; quantity: number }[];
  mode: Mode;
  paymentMethod: PaymentMethod;
  /** full card number, only needed to simulate declines for test cards */
  cardNumber?: string;
  getCashBalanceUSD?: number;
  deliverTo: SavedLocation;
  etaMinutes: number;
}

let orderCounter = 0;

/** Turn a single-store cart into a confirmed (simulated) order. */
export function simulateCheckout(input: CheckoutInput, now = new Date()): Order {
  if (input.lines.length === 0) throw new CheckoutError('empty_cart', 'The cart is empty.');
  const offers = input.lines.map((l) => {
    const offer = OFFERS.find((o) => o.id === l.offerId);
    if (!offer) throw new CheckoutError('unknown_offer', `Offer ${l.offerId} no longer exists.`);
    if (!offer.modes.includes(input.mode)) throw new CheckoutError('mode_unavailable', 'That option is not available for every item.');
    if (offer.stock < l.quantity) throw new CheckoutError('out_of_stock', 'Not enough stock.');
    return { offer, quantity: l.quantity };
  });
  const storeIds = new Set(offers.map((o) => o.offer.storeId));
  if (storeIds.size > 1) throw new CheckoutError('multi_store', 'Check out one store at a time.');
  const store = storeById.get(offers[0].offer.storeId)!;

  const lines: OrderLine[] = offers.map(({ offer, quantity }) => ({
    offerId: offer.id,
    productId: offer.productId,
    name: productById.get(offer.productId)?.name ?? 'Item',
    quantity,
    unitPrice: offer.price,
  }));
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const fees = input.mode === 'delivery' ? Math.max(...offers.map((o) => o.offer.deliveryFee)) : 0;
  const total = Math.round((subtotal + fees) * 100) / 100;

  const pm = input.paymentMethod;
  if (pm.kind === 'card' && input.cardNumber && DECLINE_CARDS.includes(input.cardNumber.replace(/\D/g, ''))) {
    throw new CheckoutError('card_declined', 'The card was declined (simulated).');
  }
  if (pm.kind === 'get_cash' && (input.getCashBalanceUSD ?? 0) < toUSD(total, store.currency)) {
    throw new CheckoutError('insufficient_get_cash', 'Not enough GET Cash.');
  }

  orderCounter += 1;
  return {
    id: `ord_${now.getTime().toString(36)}${orderCounter}`,
    storeId: store.id,
    storeName: store.name,
    mode: input.mode,
    status: 'confirmed',
    currency: store.currency,
    lines,
    subtotal: Math.round(subtotal * 100) / 100,
    fees,
    total,
    paymentMethodId: pm.id,
    paymentLabel: pm.label,
    deliverTo: input.deliverTo,
    placedAt: now.toISOString(),
    etaAt: new Date(now.getTime() + input.etaMinutes * 60_000).toISOString(),
  };
}

/** GET Cash spent in USD for an order paid with it. */
export function getCashCost(order: Order): number {
  return Math.round(toUSD(order.total, order.currency) * 100) / 100;
}

