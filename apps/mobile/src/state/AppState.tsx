import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CheckoutError,
  DEFAULT_LOCATIONS,
  DEMO_GET_CASH_USD,
  DEMO_PAYMENT_METHODS,
  OFFERS,
  createFakeCard,
  getCashCost,
  optionsForOffer,
  productById,
  simulateCheckout,
  storeById,
  type LatLng,
  type Mode,
  type NewCardInput,
  type Order,
  type PaymentMethod,
  type SavedLocation,
} from '@get/shared';
import { postCheckout } from '../api';

export interface CartLine {
  offerId: string;
  quantity: number;
}

/** One store tab of a cart (OI 2). */
export interface Cart {
  id: string;
  name?: string;
  storeId: string;
  mode: Mode;
  lines: CartLine[];
  updatedAt: number;
}

export interface Reservation {
  id: string;
  storeId: string;
  title: string;
  startsAt: string;
  partySize: number;
}

type Panel = 'location' | 'orders' | 'account' | null;

interface AppState {
  locations: SavedLocation[];
  selected: SavedLocation;
  selectLocation: (id: string) => void;
  /** a location picked on the globe or found by search; sits between Search and Here */
  pickLocation: (p: LatLng, label?: string, address?: string) => void;
  saveLocation: (loc: Omit<SavedLocation, 'id'>) => void;
  focusKey: number;

  panel: Panel;
  setPanel: (p: Panel) => void;

  carts: Cart[];
  addToCart: (offerId: string, mode: Mode) => void;
  setQuantity: (cartId: string, offerId: string, quantity: number) => void;
  setCartMode: (cartId: string, mode: Mode) => void;
  deleteCart: (cartId: string) => void;
  checkoutCart: (cartId: string) => Promise<Order | null>;
  buyNow: (offerId: string, mode: Mode) => Promise<Order | null>;

  orders: Order[];
  reservations: Reservation[];

  paymentMethods: PaymentMethod[];
  defaultPaymentId: string;
  setDefaultPayment: (id: string) => void;
  addCard: (input: NewCardInput) => string | null;
  getCashUSD: number;

  toast: string | null;
  showToast: (msg: string) => void;
}

const Ctx = createContext<AppState | null>(null);

const STARBUCKS_CROISSANT = OFFERS.find((o) => o.storeId === 'store_starbucks-chapel-st' && o.productId.includes('croissant'));

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [locations, setLocations] = useState<SavedLocation[]>(DEFAULT_LOCATIONS);
  const [picked, setPicked] = useState<SavedLocation | null>(null);
  const [selectedId, setSelectedId] = useState('loc_here');
  const [focusKey, setFocusKey] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);
  const [carts, setCarts] = useState<Cart[]>(() =>
    STARBUCKS_CROISSANT
      ? [{ id: 'cart_demo', storeId: STARBUCKS_CROISSANT.storeId, mode: 'in_store', lines: [{ offerId: STARBUCKS_CROISSANT.id, quantity: 1 }], updatedAt: Date.now() }]
      : [],
  );
  const [orders, setOrders] = useState<Order[]>([]);
  const [reservations] = useState<Reservation[]>(() => [
    {
      id: 'res_demo',
      storeId: 'store_barber-on-broadway',
      title: 'Haircut',
      startsAt: new Date(Date.now() + 26 * 3600_000).toISOString(),
      partySize: 1,
    },
  ]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(DEMO_PAYMENT_METHODS);
  const [defaultPaymentId, setDefaultPayment] = useState(DEMO_PAYMENT_METHODS[0].id);
  const [getCashUSD, setGetCash] = useState(DEMO_GET_CASH_USD);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 3200);
  }, []);

  // "Here" follows the phone's GPS when the user allows it.
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({});
        setLocations((ls) =>
          ls.map((l) => (l.id === 'loc_here' ? { ...l, lat: pos.coords.latitude, lng: pos.coords.longitude, address: 'Current location' } : l)),
        );
        setFocusKey((k) => k + 1);
      } catch {
        // keep the default "Here"
      }
    })();
  }, []);

  const allLocations = useMemo(() => (picked ? [picked, ...locations] : locations), [picked, locations]);
  const selected = allLocations.find((l) => l.id === selectedId) ?? locations[0];

  const selectLocation = (id: string) => {
    setSelectedId(id);
    if (id !== 'loc_picked') setPicked(null); // a searched location disappears once you move on
    setFocusKey((k) => k + 1);
  };

  const pickLocation = (p: LatLng, label = 'Pinned', address?: string) => {
    setPicked({ id: 'loc_picked', label, icon: 'pin', address: address ?? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`, ...p });
    setSelectedId('loc_picked');
    setFocusKey((k) => k + 1);
  };

  const saveLocation = (loc: Omit<SavedLocation, 'id'>) => {
    // "Add" places the location at the far right and does not select it
    setLocations((ls) => [...ls, { ...loc, id: `loc_${Date.now()}` }]);
  };

  const addToCart = (offerId: string, mode: Mode) => {
    const offer = OFFERS.find((o) => o.id === offerId);
    if (!offer) return;
    setCarts((cs) => {
      const existing = cs.find((c) => c.storeId === offer.storeId);
      if (!existing) {
        return [{ id: `cart_${Date.now()}`, storeId: offer.storeId, mode, lines: [{ offerId, quantity: 1 }], updatedAt: Date.now() }, ...cs];
      }
      const lines = existing.lines.some((l) => l.offerId === offerId)
        ? existing.lines.map((l) => (l.offerId === offerId ? { ...l, quantity: l.quantity + 1 } : l))
        : [...existing.lines, { offerId, quantity: 1 }];
      // carts are ordered by last edit
      return [{ ...existing, lines, updatedAt: Date.now() }, ...cs.filter((c) => c !== existing)];
    });
    showToast(`Added to ${storeById.get(offer.storeId)?.name} cart`);
  };

  const setQuantity = (cartId: string, offerId: string, quantity: number) =>
    setCarts((cs) =>
      cs
        .map((c) =>
          c.id !== cartId
            ? c
            : { ...c, updatedAt: Date.now(), lines: c.lines.map((l) => (l.offerId === offerId ? { ...l, quantity } : l)).filter((l) => l.quantity > 0) },
        )
        // removing the last item deletes the cart
        .filter((c) => c.lines.length > 0),
    );

  const setCartMode = (cartId: string, mode: Mode) =>
    setCarts((cs) => cs.map((c) => (c.id === cartId ? { ...c, mode, updatedAt: Date.now() } : c)));

  const deleteCart = (cartId: string) => setCarts((cs) => cs.filter((c) => c.id !== cartId));

  const place = async (lines: CartLine[], mode: Mode): Promise<Order | null> => {
    const pm = paymentMethods.find((p) => p.id === defaultPaymentId) ?? paymentMethods[0];
    const eta = Math.max(...lines.map((l) => optionsForOffer(OFFERS.find((o) => o.id === l.offerId)!, selected).find((o) => o.mode === mode)?.etaMinutes ?? 30));
    try {
      const input = { lines, mode, paymentMethod: pm, getCashBalanceUSD: getCashUSD, deliverTo: selected, etaMinutes: eta };
      const order = (await postCheckout(input)) ?? simulateCheckout(input);
      if (pm.kind === 'get_cash') setGetCash((v) => Math.round((v - getCashCost(order)) * 100) / 100);
      setOrders((os) => [order, ...os]);
      return order;
    } catch (e) {
      showToast(e instanceof CheckoutError ? e.message : 'Could not place the order.');
      return null;
    }
  };

  const checkoutCart = async (cartId: string) => {
    const cart = carts.find((c) => c.id === cartId);
    if (!cart) return null;
    const order = await place(cart.lines, cart.mode);
    if (order) {
      deleteCart(cartId);
      showToast(`Ordered from ${order.storeName}`);
    }
    return order;
  };

  const buyNow = async (offerId: string, mode: Mode) => {
    const order = await place([{ offerId, quantity: 1 }], mode);
    if (order) {
      const name = productById.get(order.lines[0].productId)?.name ?? 'Item';
      showToast(`GOT it: ${name} · ${order.storeName}`);
    }
    return order;
  };

  const addCard = (input: NewCardInput) => {
    try {
      const pm = createFakeCard(input);
      setPaymentMethods((p) => [...p, pm]);
      setDefaultPayment(pm.id);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Invalid card';
    }
  };

  const value: AppState = {
    locations: allLocations,
    selected,
    selectLocation,
    pickLocation,
    saveLocation,
    focusKey,
    panel,
    setPanel,
    carts,
    addToCart,
    setQuantity,
    setCartMode,
    deleteCart,
    checkoutCart,
    buyNow,
    orders,
    reservations,
    paymentMethods,
    defaultPaymentId,
    setDefaultPayment,
    addCard,
    getCashUSD,
    toast,
    showToast,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppStateProvider');
  return v;
}
