import { beforeAll, describe, expect, it } from 'vitest';
import { generateCatalog } from '../scripts/generate-catalog';
import { createFakeCard, luhnValid, simulateCheckout, CheckoutError } from './checkout';
import { DEFAULT_LOCATIONS, DEMO_PAYMENT_METHODS, OFFERS, PRODUCTS, STORES, loadCatalog } from './seed';
import { search, suggest } from './engine';

const newHaven = DEFAULT_LOCATIONS[0];

// the apps load the catalogue from Supabase; the tests use the generator that seeds it
beforeAll(() => loadCatalog(generateCatalog()));

describe('seed', () => {
  it('has unique ids', () => {
    for (const list of [STORES, PRODUCTS, OFFERS]) {
      expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
    }
  });
  it('every product has at least one offer', () => {
    const offered = new Set(OFFERS.map((o) => o.productId));
    expect(PRODUCTS.filter((p) => !offered.has(p.id)).map((p) => p.name)).toEqual([]);
  });
});

describe('search', () => {
  it('finds both baseball bats; Soonest puts a same-day option first', () => {
    const res = search({ query: 'baseball bat', location: newHaven, preset: 'soonest' });
    expect(res.map((r) => r.product.name)).toEqual(
      expect.arrayContaining(['Wooden baseball bat 33 in', 'Metal baseball bat 32 in']),
    );
    expect(res[0].best.etaMinutes).toBeLessThan(24 * 60);
  });
  it('matches on enriched metadata (blackboard screwing)', () => {
    const res = search({ query: 'blackboard screws', location: newHaven });
    expect(res[0].product.name).toContain('screw mount');
  });
  it('respects mode filters', () => {
    const res = search({ query: 'water', location: newHaven, modes: ['delivery'] });
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((r) => r.options.every((o) => o.mode === 'delivery'))).toBe(true);
  });
  it('Balanced lets a much cheaper parcel beat a pricey nearby store', () => {
    const [r] = search({ query: 'airpods', location: { lat: 19.4326, lng: -99.1937 } });
    expect(r.best.mode).toBe('delivery');
    expect(r.best.etaMinutes).toBeGreaterThan(24 * 60);
  });
  it('can sort by price', () => {
    const res = search({ query: 'airpods', location: newHaven, sort: 'price' });
    const totals = res[0].options.map((o) => o.total);
    expect([...totals].sort((a, b) => a - b)).toEqual(totals);
  });
  it('suggests completions', () => {
    expect(suggest('base').some((s) => s.toLowerCase().includes('baseball'))).toBe(true);
  });
});

describe('checkout', () => {
  it('validates fake cards', () => {
    expect(luhnValid('4242 4242 4242 4242')).toBe(true);
    expect(luhnValid('4242 4242 4242 4241')).toBe(false);
    expect(createFakeCard({ number: '5555555555554444', expMonth: 1, expYear: 2099, cvc: '123' }).brand).toBe('Mastercard');
  });
  it('places a simulated order', () => {
    const [r] = search({ query: 'chicken salad', location: newHaven, modes: ['pickup'] });
    const order = simulateCheckout({
      lines: [{ offerId: r.best.offerId, quantity: 1 }],
      mode: 'pickup',
      paymentMethod: DEMO_PAYMENT_METHODS[0],
      deliverTo: newHaven,
      etaMinutes: r.best.etaMinutes,
    });
    expect(order.status).toBe('confirmed');
    expect(order.total).toBeGreaterThan(0);
  });
  it('declines test decline cards', () => {
    const [r] = search({ query: 'chicken salad', location: newHaven, modes: ['pickup'] });
    expect(() =>
      simulateCheckout({
        lines: [{ offerId: r.best.offerId, quantity: 1 }],
        mode: 'pickup',
        paymentMethod: DEMO_PAYMENT_METHODS[0],
        cardNumber: '4000 0000 0000 0002',
        deliverTo: newHaven,
        etaMinutes: 10,
      }),
    ).toThrow(CheckoutError);
  });
});
