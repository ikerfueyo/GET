import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCatalog } from '@get/shared';
import { generateCatalog } from '@get/shared/scripts/generate-catalog';
import { createApp } from './app';
import { Persistence, createUserState } from './store';

// the server reads the catalogue from Supabase; tests use the generator that seeds it
beforeAll(() => loadCatalog(generateCatalog()));

const app = () => createApp(createUserState(), new Persistence('', '', ''));

describe('GET API', () => {
  it('searches near a location', async () => {
    const res = await request(app()).get('/search').query({ q: 'chicken salad', lat: 41.3083, lng: -72.9279 });
    expect(res.status).toBe(200);
    expect(res.body[0].product.name).toBe('Chicken salad');
  });

  it('checks out with a fake card and lists the order', async () => {
    const a = app();
    const [result] = (await request(a).get('/search').query({ q: 'chicken salad', modes: 'pickup' })).body;
    const order = await request(a)
      .post('/checkout')
      .send({ lines: [{ offerId: result.best.offerId, quantity: 2 }], mode: 'pickup', paymentMethodId: 'pm_visa' });
    expect(order.status).toBe(201);
    const orders = await request(a).get('/orders');
    expect(orders.body).toHaveLength(1);
  });

  it('spends GET Cash and rejects invalid cards', async () => {
    const a = app();
    const [result] = (await request(a).get('/search').query({ q: 'latte', modes: 'pickup' })).body;
    await request(a).post('/checkout').send({ lines: [{ offerId: result.best.offerId, quantity: 1 }], mode: 'pickup', paymentMethodId: 'pm_getcash' });
    expect((await request(a).get('/wallet')).body.getCashUSD).toBeLessThan(150);
    const bad = await request(a).post('/payment-methods').send({ number: '1234 5678 9012 3456', expMonth: 1, expYear: 2099, cvc: '123' });
    expect(bad.status).toBe(400);
  });
});
