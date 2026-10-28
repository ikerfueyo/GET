import type { Currency, LatLng } from './types';

const EARTH_RADIUS_KM = 6371;

export function distanceKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Simulated, fixed exchange rates: how many units of the currency one USD buys. */
export const USD_RATES: Record<Currency, number> = {
  USD: 1,
  MXN: 18.5,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 150,
};

export function toUSD(amount: number, currency: Currency): number {
  return amount / USD_RATES[currency];
}

export function fromUSD(amountUSD: number, currency: Currency): number {
  return amountUSD * USD_RATES[currency];
}

export function formatMoney(amount: number, currency: Currency): string {
  const digits = currency === 'JPY' ? 0 : 2;
  const symbol: Record<Currency, string> = { USD: '$', MXN: '$', EUR: '€', GBP: '£', JPY: '¥' };
  const n = amount.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return currency === 'USD' ? `${symbol[currency]}${n}` : `${symbol[currency]}${n} ${currency}`;
}

export function formatEta(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / (60 * 24))} d`;
}
