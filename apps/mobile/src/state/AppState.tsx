import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { useAuth } from './Auth';
import * as remote from './remote';
import type { Place } from '../places';

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
  pickLocation: (p: LatLng, label?: string, address?: string, extra?: Pick<SavedLocation, 'buildingType' | 'details'>) => void;
  /** places found with Location Search / Add, newest first (LI 11 / LI 16 "recent") */
  recentPlaces: Place[];
  addRecentPlace: (p: Place) => void;
  saveLocation: (loc: Omit<SavedLocation, 'id'>) => void;
  /** Done on an Edit form; Here and a searched location only change on this device */
  updateLocation: (id: string, patch: Partial<Omit<SavedLocation, 'id'>>) => void;
  removeLocation: (id: string) => void;
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

  profile: remote.Profile;
  updateProfile: (patch: Partial<Omit<remote.Profile, 'getCashUSD'>>) => void;

  toast: string | null;
  showToast: (msg: string) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // the account lives in Supabase; App only mounts this once someone is signed in
  const userId = user!.id;
  const [ready, setReady] = useState(false);
  const [locations, setLocations] = useState<SavedLocation[]>(DEFAULT_LOCATIONS);
  const [picked, setPicked] = useState<SavedLocation | null>(null);
  const [selectedId, setSelectedId] = useState('loc_here');
  const [focusKey, setFocusKey] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);
  const [carts, setCartsState] = useState<Cart[]>([]);
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
  const [profile, setProfile] = useState<remote.Profile>({ fullName: user?.name ?? '', username: '', phone: '', getCashUSD: DEMO_GET_CASH_USD });
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 3200);
  }, []);

  // cart edits are computed from the latest carts so the same value can be saved
  const cartsRef = useRef(carts);
  const setCarts = (next: Cart[]) => {
    cartsRef.current = next;
    setCartsState(next);
  };

  // database writes run one at a time, in the order they were made
  const queue = useRef(Promise.resolve());
  const persist = (write: (userId: string) => Promise<unknown>, failure = 'Could not save that to your account.') => {
    queue.current = queue.current
      .then(() => write(userId))
      .then(
        () => undefined,
        (e) => {
          console.warn('Supabase write failed', e);
          showToast(failure);
        },
      );
  };

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await remote.catalogReady();
        const a = await remote.loadAccount(userId, user?.name ?? '');
        if (!live) return;
        // keep "Here" as GPS already set it
        setLocations((ls) => [ls.find((l) => l.id === 'loc_here') ?? a.locations[0], ...a.locations.slice(1)]);
        setPaymentMethods(a.paymentMethods);
        setDefaultPayment(a.defaultPaymentId);
        setGetCash(a.profile.getCashUSD);
        setProfile(a.profile);
        setCarts(a.carts);
        setOrders(a.orders);
      } catch (e) {
        console.warn('Could not load the account', e);
        if (live) showToast('Could not load your account. Changes may not be saved.');
      } finally {
        if (live) setReady(true);
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // "Here" follows the phone's GPS while the app is open, when the user allows it.
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    let first = true;
    let geocoding = 0; // only the latest fix's address is kept
    const setHere = (patch: Partial<SavedLocation>) => setLocations((ls) => ls.map((l) => (l.id === 'loc_here' ? { ...l, ...patch } : l)));
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 20, timeInterval: 5000 }, async (pos) => {
          const { latitude, longitude } = pos.coords;
          setHere(first ? { lat: latitude, lng: longitude, address: 'Current location' } : { lat: latitude, lng: longitude });
          if (first) setFocusKey((k) => k + 1); // fly there once; after that only the pin moves
          first = false;
          // then the street address, ending with the country (the phone's geocoder; not on web)
          const n = ++geocoding;
          const [g] = await Location.reverseGeocodeAsync({ latitude, longitude }).catch(() => []);
          const street = g && [g.streetNumber, g.street].filter(Boolean).join(' ');
          const region = g && [g.region, g.postalCode].filter(Boolean).join(' ');
          const address = g && [street || g.name, g.city, region, g.country].filter(Boolean).join(', ');
          if (address && n === geocoding) setHere({ address });
        });
        if (cancelled) sub.remove();
      } catch {
        // keep the default "Here"
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  const allLocations = useMemo(() => (picked ? [picked, ...locations] : locations), [picked, locations]);
  const selected = allLocations.find((l) => l.id === selectedId) ?? locations[0];

  const selectLocation = (id: string) => {
    setSelectedId(id);
    if (id !== 'loc_picked') setPicked(null); // a searched location disappears once you move on
    setFocusKey((k) => k + 1);
  };

  const pickLocation = (p: LatLng, label = 'Pinned', address?: string, extra?: Pick<SavedLocation, 'buildingType' | 'details'>) => {
    setPicked({ id: 'loc_picked', label, icon: 'pin', address: address ?? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`, lat: p.lat, lng: p.lng, ...extra });
    setSelectedId('loc_picked');
    setFocusKey((k) => k + 1);
  };

  const [recentPlaces, setRecentPlaces] = useState<Place[]>([]);
  const addRecentPlace = (p: Place) =>
    setRecentPlaces((rs) => [p, ...rs.filter((r) => r.name !== p.name || r.address !== p.address)].slice(0, 10));

  const saveLocation = (loc: Omit<SavedLocation, 'id'>) => {
    // "Add" places the location at the far right and does not select it
    const saved = { ...loc, id: remote.newId() };
    const position = locations.length;
    setLocations((ls) => [...ls, saved]);
    persist((uid) => remote.insertLocation(uid, saved, position));
  };

  const updateLocation = (id: string, patch: Partial<Omit<SavedLocation, 'id'>>) => {
    if (id === 'loc_picked') {
      setPicked((p) => (p ? { ...p, ...patch } : p));
    } else {
      setLocations((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
      if (id !== 'loc_here') persist(() => remote.updateLocation(id, patch));
    }
    if (patch.lat !== undefined || patch.lng !== undefined) setFocusKey((k) => k + 1);
  };

  const removeLocation = (id: string) => {
    if (id === 'loc_here') return;
    setLocations((ls) => ls.filter((l) => l.id !== id));
    persist(() => remote.deleteLocation(id));
    // if the deleted one was selected, Here becomes the selection
    if (id === selectedId) selectLocation('loc_here');
  };

  const addToCart = (offerId: string, mode: Mode) => {
    const offer = OFFERS.find((o) => o.id === offerId);
    if (!offer) return;
    const cs = cartsRef.current;
    const existing = cs.find((c) => c.storeId === offer.storeId);
    let cart: Cart;
    if (!existing) {
      cart = { id: remote.newId(), storeId: offer.storeId, mode, lines: [{ offerId, quantity: 1 }], updatedAt: Date.now() };
    } else {
      const lines = existing.lines.some((l) => l.offerId === offerId)
        ? existing.lines.map((l) => (l.offerId === offerId ? { ...l, quantity: l.quantity + 1 } : l))
        : [...existing.lines, { offerId, quantity: 1 }];
      cart = { ...existing, lines, updatedAt: Date.now() };
    }
    // carts are ordered by last edit
    setCarts([cart, ...cs.filter((c) => c !== existing)]);
    persist((uid) => remote.saveCart(uid, cart));
    showToast(`Added to ${storeById.get(offer.storeId)?.name} cart`);
  };

  const editCart = (cartId: string, edit: (c: Cart) => Cart) => {
    const old = cartsRef.current.find((c) => c.id === cartId);
    if (!old) return;
    const cart = { ...edit(old), updatedAt: Date.now() };
    // removing the last item deletes the cart
    if (!cart.lines.length) return deleteCart(cartId);
    setCarts(cartsRef.current.map((c) => (c.id === cartId ? cart : c)));
    persist((uid) => remote.saveCart(uid, cart));
  };

  const setQuantity = (cartId: string, offerId: string, quantity: number) =>
    editCart(cartId, (c) => ({ ...c, lines: c.lines.map((l) => (l.offerId === offerId ? { ...l, quantity } : l)).filter((l) => l.quantity > 0) }));

  const setCartMode = (cartId: string, mode: Mode) => editCart(cartId, (c) => ({ ...c, mode }));

  const deleteCart = (cartId: string) => {
    setCarts(cartsRef.current.filter((c) => c.id !== cartId));
    persist(() => remote.deleteCart(cartId));
  };

  const place = async (lines: CartLine[], mode: Mode): Promise<Order | null> => {
    const pm = paymentMethods.find((p) => p.id === defaultPaymentId) ?? paymentMethods[0];
    const eta = Math.max(...lines.map((l) => optionsForOffer(OFFERS.find((o) => o.id === l.offerId)!, selected).find((o) => o.mode === mode)?.etaMinutes ?? 30));
    try {
      const input = { lines, mode, paymentMethod: pm, getCashBalanceUSD: getCashUSD, deliverTo: selected, etaMinutes: eta };
      // the order is simulated on the phone and saved to the user's account
      const order = { ...simulateCheckout(input), id: remote.newId() };
      setOrders((os) => [order, ...os]);
      persist((uid) => remote.insertOrder(uid, order));
      if (pm.kind === 'get_cash') {
        const left = Math.round((getCashUSD - getCashCost(order)) * 100) / 100;
        setGetCash(left);
        persist((uid) => remote.updateProfile(uid, { getCashUSD: left }));
      }
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
      const pm = { ...createFakeCard(input), id: remote.newId() };
      setPaymentMethods((p) => [...p, pm]);
      setDefaultPayment(pm.id);
      persist(async (uid) => {
        await remote.insertPaymentMethod(uid, pm);
        await remote.setDefaultPaymentMethod(uid, pm.id);
      });
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
    recentPlaces,
    addRecentPlace,
    saveLocation,
    updateLocation,
    removeLocation,
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
    setDefaultPayment: (id: string) => {
      setDefaultPayment(id);
      persist((uid) => remote.setDefaultPaymentMethod(uid, id));
    },
    addCard,
    getCashUSD,
    profile,
    updateProfile: (patch) => {
      setProfile((p) => ({ ...p, ...patch }));
      // usernames are unique across GET
      persist((uid) => remote.updateProfile(uid, patch), patch.username ? `Could not save. The username “${patch.username}” may be taken.` : undefined);
    },
    toast,
    showToast,
  };
  // Home waits for the account so it never flashes demo data
  return <Ctx.Provider value={value}>{ready ? children : null}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppStateProvider');
  return v;
}
