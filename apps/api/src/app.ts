import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  CheckoutError,
  DEFAULT_LOCATIONS,
  MODES,
  OFFERS,
  PRODUCTS,
  STORES,
  createFakeCard,
  getCashCost,
  search,
  simulateCheckout,
  suggest,
  type Currency,
  type Mode,
  type SortKey,
} from '@get/shared';
import { Persistence, createUserState, type UserState } from './store';

const num = (v: unknown) => (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined);

export function createApp(state: UserState = createUserState(), persistence = new Persistence()) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true, persistence: persistence.enabled ? 'supabase' : 'memory' });
  });

  // ── catalogue ──
  app.get('/stores', (_req, res) => res.json(STORES));
  app.get('/products', (_req, res) => res.json(PRODUCTS));
  app.get('/offers', (req, res) => {
    const { storeId, productId } = req.query;
    res.json(OFFERS.filter((o) => (!storeId || o.storeId === storeId) && (!productId || o.productId === productId)));
  });

  // ── search ──
  app.get('/search', (req, res) => {
    const lat = num(req.query.lat) ?? DEFAULT_LOCATIONS[0].lat;
    const lng = num(req.query.lng) ?? DEFAULT_LOCATIONS[0].lng;
    const modes = typeof req.query.modes === 'string' ? (req.query.modes.split(',').filter((m) => MODES.includes(m as Mode)) as Mode[]) : undefined;
    res.json(
      search({
        query: String(req.query.q ?? ''),
        location: { lat, lng },
        modes,
        sort: (req.query.sort as SortKey) ?? 'best',
        maxKm: num(req.query.maxKm),
        minRating: num(req.query.minRating),
        maxPriceUSD: num(req.query.maxPrice),
        urgent: req.query.urgent === 'true',
        currency: (req.query.currency as Currency) ?? 'USD',
      }),
    );
  });
  app.get('/suggest', (req, res) => res.json(suggest(String(req.query.q ?? ''))));

  // ── the demo user ──
  app.get('/locations', (_req, res) => res.json(DEFAULT_LOCATIONS));
  app.get('/wallet', (_req, res) => res.json({ getCashUSD: state.getCashUSD, paymentMethods: state.paymentMethods }));
  app.post('/payment-methods', (req, res) => {
    const pm = createFakeCard(req.body);
    state.paymentMethods.push(pm);
    res.status(201).json(pm);
  });
  app.get('/orders', (_req, res) => res.json(state.orders));
  app.post('/checkout', async (req, res) => {
    const { lines, mode, paymentMethodId, cardNumber, deliverTo, etaMinutes } = req.body ?? {};
    const pm = state.paymentMethods.find((p) => p.id === paymentMethodId);
    if (!pm) throw new CheckoutError('unknown_payment_method', 'Pick a payment method.');
    const order = simulateCheckout({
      lines,
      mode,
      paymentMethod: pm,
      cardNumber,
      getCashBalanceUSD: state.getCashUSD,
      deliverTo: deliverTo ?? DEFAULT_LOCATIONS[0],
      etaMinutes: Number(etaMinutes ?? 30),
    });
    if (pm.kind === 'get_cash') state.getCashUSD = Math.round((state.getCashUSD - getCashCost(order)) * 100) / 100;
    state.orders.unshift(order);
    await persistence.saveOrder(order);
    res.status(201).json(order);
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof CheckoutError) {
      res.status(400).json({ error: err.code, message: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'internal', message: 'Something went wrong.' });
  });

  return app;
}
