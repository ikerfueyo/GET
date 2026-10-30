/**
 * OI 1: Carts, Reservations & Appointments, and Orders, each a horizontal
 * row of boxes. A cart box opens the cart (OI 2), an order box its receipt.
 */
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  MODE_LABEL,
  MODES,
  OFFERS,
  formatEta,
  formatMoney,
  optionsForOffer,
  productById,
  storeAddress,
  storeById,
  type Mode,
  type Order,
} from '@get/shared';
import { CloseIcon, PlusIcon } from '../components/Icons';
import { Button, SectionHeader, T } from '../components/ui';
import { useApp, type Cart } from '../state/AppState';
import { colors } from '../theme';

const BOX = 104;

export function OrdersInterface({ top, bottom, onAddItem }: { top: number; bottom: number; onAddItem: () => void }) {
  const { carts, orders, reservations } = useApp();
  const [openCart, setOpenCart] = useState<string | null>(null);
  const [openOrder, setOpenOrder] = useState<Order | null>(null);
  const cart = carts.find((c) => c.id === openCart);

  // pickup and delivery orders sorted by soonest completion
  const active = [...orders].sort((a, b) => a.etaAt.localeCompare(b.etaAt));

  return (
    <View style={[styles.panel, { top, bottom }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
        <SectionHeader title="Carts" right={<T style={styles.chev}>›</T>} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          <Pressable style={[styles.box, styles.center]} onPress={onAddItem} accessibilityLabel="Create cart">
            <PlusIcon size={34} />
          </Pressable>
          {carts.map((c) => (
            <CartBox key={c.id} cart={c} onPress={() => setOpenCart(c.id)} />
          ))}
        </ScrollView>

        <SectionHeader title="Reservations & Appointments" right={<T style={styles.chev}>›</T>} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {reservations.map((r) => (
            <View key={r.id} style={styles.box}>
              <T style={styles.boxStore} numberOfLines={2}>
                {storeById.get(r.storeId)?.name}
              </T>
              <T style={styles.boxLine}>{r.title}</T>
              <T style={styles.boxMeta}>
                {new Date(r.startsAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              </T>
              <T style={styles.boxMeta}>{new Date(r.startsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</T>
            </View>
          ))}
          <EmptyBoxes n={Math.max(0, 3 - reservations.length)} />
        </ScrollView>

        <SectionHeader title="Orders" right={<T style={styles.chev}>›</T>} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {active.map((o) => (
            <OrderBox key={o.id} order={o} onPress={() => setOpenOrder(o)} />
          ))}
          <EmptyBoxes n={Math.max(0, 3 - active.length)} />
        </ScrollView>
      </ScrollView>

      {cart && <CartSheet cart={cart} onClose={() => setOpenCart(null)} onAddItem={onAddItem} />}
      {openOrder && <OrderSheet order={openOrder} onClose={() => setOpenOrder(null)} />}
    </View>
  );
}

function EmptyBoxes({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={[styles.box, { opacity: 0.55 }]} />
      ))}
    </>
  );
}

function cartTotals(cart: Cart) {
  const store = storeById.get(cart.storeId)!;
  const lines = cart.lines.map((l) => ({ ...l, offer: OFFERS.find((o) => o.id === l.offerId)! }));
  const subtotal = lines.reduce((s, l) => s + l.offer.price * l.quantity, 0);
  const fees = cart.mode === 'delivery' ? Math.max(0, ...lines.map((l) => l.offer.deliveryFee)) : 0;
  return { store, lines, subtotal, fees, total: subtotal + fees };
}

function CartBox({ cart, onPress }: { cart: Cart; onPress: () => void }) {
  const { store, lines, total } = cartTotals(cart);
  return (
    <Pressable style={styles.box} onPress={onPress} accessibilityLabel={`${store.name} cart`}>
      <T style={styles.boxStore} numberOfLines={1}>
        {cart.name ?? store.name}
      </T>
      {lines.slice(0, 2).map((l) => (
        <T key={l.offerId} style={styles.boxLine} numberOfLines={1}>
          {l.quantity} {productById.get(l.offer.productId)?.name}
        </T>
      ))}
      <T style={styles.boxMeta}>{MODE_LABEL[cart.mode]}</T>
      <T style={styles.boxTotal}>{formatMoney(total, store.currency)}</T>
    </Pressable>
  );
}

export function orderProgress(order: Order, now = Date.now()) {
  const start = Date.parse(order.placedAt);
  const end = Date.parse(order.etaAt);
  const f = Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start)));
  const status =
    f >= 1 ? (order.mode === 'delivery' ? 'Delivered' : 'Ready') : f > 0.5 ? (order.mode === 'delivery' ? 'On the way' : 'Almost ready') : f > 0.1 ? 'Preparing' : 'Confirmed';
  return { f, status, minutesLeft: Math.max(0, (end - now) / 60_000) };
}

function OrderBox({ order, onPress }: { order: Order; onPress: () => void }) {
  const { status, minutesLeft } = orderProgress(order);
  return (
    <Pressable style={styles.box} onPress={onPress}>
      <T style={styles.boxStore} numberOfLines={1}>
        {order.storeName}
      </T>
      <T style={styles.boxLine} numberOfLines={1}>
        {order.lines.reduce((s, l) => s + l.quantity, 0)} item(s) · {MODE_LABEL[order.mode]}
      </T>
      <T style={styles.boxMeta}>{status}</T>
      <T style={styles.boxTotal}>{minutesLeft > 0 ? formatEta(minutesLeft) : '✓'}</T>
    </Pressable>
  );
}

/** OI 2: the cart of one store. */
function CartSheet({ cart, onClose, onAddItem }: { cart: Cart; onClose: () => void; onAddItem: () => void }) {
  const { setQuantity, setCartMode, deleteCart, checkoutCart, paymentMethods, defaultPaymentId, setDefaultPayment, selected } = useApp();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { store, lines, subtotal, fees, total } = cartTotals(cart);
  const cur = store.currency;
  // a mode is offered only if every item supports it
  const modeOk = (m: Mode) => lines.every((l) => l.offer.modes.includes(m));
  const eta = Math.max(...lines.map((l) => optionsForOffer(l.offer, selected).find((o) => o.mode === cart.mode)?.etaMinutes ?? 0));
  const requirements = [...new Set(lines.flatMap((l) => productById.get(l.offer.productId)?.requirements ?? []))];

  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHead}>
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close cart">
          <CloseIcon size={18} />
        </Pressable>
        <Pressable onPress={() => setConfirmDelete(true)}>
          <T style={{ color: colors.red }}>Delete cart</T>
        </Pressable>
      </View>
      <ScrollView>
        <T style={styles.storeTitle}>{store.name}</T>
        <T style={styles.storeSub}>
          {storeAddress(store)} · ★ {store.rating.toFixed(1)}
          {store.verified ? ' · ✓ verified' : ''}
        </T>
        {lines.map((l) => {
          const p = productById.get(l.offer.productId)!;
          return (
            <View key={l.offerId} style={styles.line}>
              <View style={styles.thumb}>
                <T style={{ fontSize: 22 }}>{p.glyph}</T>
              </View>
              <View style={{ flex: 1 }}>
                <T style={styles.lineName} numberOfLines={2}>
                  {p.name}
                </T>
                <T style={styles.lineSub}>{p.brand}</T>
              </View>
              <View style={styles.stepper}>
                <Pressable onPress={() => setQuantity(cart.id, l.offerId, l.quantity - 1)} style={styles.stepBtn}>
                  <T>−</T>
                </Pressable>
                <T style={styles.qty}>{l.quantity}</T>
                <Pressable onPress={() => setQuantity(cart.id, l.offerId, l.quantity + 1)} style={styles.stepBtn}>
                  <T>+</T>
                </Pressable>
              </View>
              <T style={styles.linePrice}>{formatMoney(l.offer.price * l.quantity, cur)}</T>
            </View>
          );
        })}
        <Pressable onPress={onAddItem} style={{ paddingVertical: 8 }}>
          <T style={{ fontWeight: '600' }}>+ Add item</T>
        </Pressable>

        <View style={styles.tabs}>
          {MODES.map((m) => (
            <Pressable
              key={m}
              disabled={!modeOk(m)}
              onPress={() => setCartMode(cart.id, m)}
              style={[styles.tab, cart.mode === m && styles.tabOn, !modeOk(m) && { opacity: 0.35 }]}
            >
              <T style={[styles.tabText, cart.mode === m && { fontWeight: '700' }]}>{MODE_LABEL[m]}</T>
            </Pressable>
          ))}
        </View>

        {cart.mode === 'in_store' && (
          <View style={styles.info}>
            <T style={styles.infoText}>📍 {storeAddress(store)}</T>
            <T style={styles.infoText}>Store checkout only · open {store.hours}</T>
            <Pressable
              style={styles.goBtn}
              onPress={() => {
                const q = `${store.lat},${store.lng}`;
                Linking.openURL(Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${q}` : `https://www.google.com/maps/dir/?api=1&destination=${q}`);
              }}
            >
              <T style={{ color: colors.white, fontWeight: '700' }}>➤ Go to {store.name.split(' ')[0]}</T>
            </Pressable>
          </View>
        )}
        {cart.mode === 'pickup' && (
          <View style={styles.info}>
            <T style={styles.infoText}>Ready in about {formatEta(eta)} at {storeAddress(store)}</T>
          </View>
        )}
        {cart.mode === 'delivery' && (
          <View style={styles.info}>
            <T style={styles.infoText}>To {selected.label} · {selected.address}</T>
            <T style={styles.infoText}>Arrives in about {formatEta(eta)}</T>
          </View>
        )}
        {requirements.map((r) => (
          <T key={r} style={styles.requirement}>
            ⚠ {r}
          </T>
        ))}

        <View style={styles.totals}>
          <Row label="Subtotal" value={formatMoney(subtotal, cur)} />
          <Row label="Fees" value={formatMoney(fees, cur)} />
          <Row label="Total" value={formatMoney(total, cur)} bold />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
          {paymentMethods.map((pm) => (
            <Pressable key={pm.id} onPress={() => setDefaultPayment(pm.id)} style={[styles.pm, pm.id === defaultPaymentId && styles.pmOn]}>
              <T style={[styles.pmText, pm.id === defaultPaymentId && { color: colors.white }]}>{pm.label}</T>
            </Pressable>
          ))}
        </ScrollView>

        <Button
          label={cart.mode === 'in_store' ? 'Pay with GET' : 'GET'}
          onPress={async () => {
            const order = await checkoutCart(cart.id);
            if (order) onClose();
          }}
        />
        <T style={styles.simNote}>Simulated purchase · no real charge</T>
      </ScrollView>

      {confirmDelete && (
        <View style={styles.confirm}>
          <T style={{ fontSize: 18, marginBottom: 12 }}>Delete {store.name} cart?</T>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Cancel" kind="secondary" onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} />
            <Button
              label="Delete cart"
              kind="danger"
              onPress={() => {
                deleteCart(cart.id);
                onClose();
              }}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      )}
    </View>
  );
}

function OrderSheet({ order, onClose }: { order: Order; onClose: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);
  const { f, status, minutesLeft } = orderProgress(order);
  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHead}>
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close order">
          <CloseIcon size={18} />
        </Pressable>
        <T style={styles.lineSub}>{new Date(order.placedAt).toLocaleString()}</T>
      </View>
      <T style={styles.storeTitle}>{order.storeName}</T>
      <T style={styles.storeSub}>
        {MODE_LABEL[order.mode]} · {status}
        {minutesLeft > 0 ? ` · ${formatEta(minutesLeft)} left` : ''}
      </T>
      <View style={styles.progress}>
        <View style={[styles.progressFill, { width: `${Math.round(f * 100)}%` }]} />
      </View>
      {order.lines.map((l) => (
        <View key={l.offerId} style={styles.line}>
          <T style={{ width: 24 }}>{l.quantity}</T>
          <T style={[styles.lineName, { flex: 1 }]}>{l.name}</T>
          <T style={styles.linePrice}>{formatMoney(l.unitPrice * l.quantity, order.currency)}</T>
        </View>
      ))}
      <View style={styles.totals}>
        <Row label="Subtotal" value={formatMoney(order.subtotal, order.currency)} />
        <Row label="Fees" value={formatMoney(order.fees, order.currency)} />
        <Row label="Total" value={formatMoney(order.total, order.currency)} bold />
      </View>
      <T style={styles.infoText}>Paid with {order.paymentLabel} (simulated)</T>
      {order.mode === 'delivery' && <T style={styles.infoText}>To {order.deliverTo.address}</T>}
    </View>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.totalRow}>
      <T style={[styles.totalLabel, bold && { fontWeight: '700' }]}>{label}</T>
      <T style={[styles.totalValue, bold && { fontWeight: '700', fontSize: 18 }]}>{value}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 10,
    right: 10,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderRadius: 10,
    borderColor: colors.black,
    overflow: 'hidden',
    zIndex: 15,
  },
  chev: { fontSize: 26, lineHeight: 26 },
  row: { paddingHorizontal: 12, gap: 10 },
  box: { width: BOX, height: BOX, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.black, padding: 6 },
  center: { alignItems: 'center', justifyContent: 'center' },
  boxStore: { fontWeight: '700', fontSize: 13 },
  boxLine: { fontSize: 11, marginTop: 2 },
  boxMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  boxTotal: { position: 'absolute', right: 6, bottom: 5, fontWeight: '700', fontSize: 12 },
  // left padding keeps content clear of the floating side bar
  sheet: { ...StyleSheet.absoluteFill, backgroundColor: colors.white, padding: 14, paddingLeft: 56 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  storeTitle: { fontSize: 28, fontWeight: '700' },
  storeSub: { fontSize: 12, color: colors.muted, marginBottom: 8 },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.hairline, gap: 8 },
  thumb: { width: 40, height: 40, borderWidth: 1, borderColor: colors.black, alignItems: 'center', justifyContent: 'center' },
  lineName: { fontSize: 14 },
  lineSub: { fontSize: 11, color: colors.muted },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.black },
  stepBtn: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  qty: { width: 20, textAlign: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.black },
  linePrice: { fontSize: 14, minWidth: 64, textAlign: 'right' },
  tabs: { flexDirection: 'row', marginTop: 8, backgroundColor: '#EFEFEF', borderRadius: 18, padding: 3 },
  tab: { flex: 1, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: '#BDBDBD' },
  tabText: { fontSize: 14 },
  info: { paddingVertical: 10, gap: 4 },
  infoText: { fontSize: 13 },
  goBtn: { alignSelf: 'flex-start', backgroundColor: colors.black, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, marginTop: 6 },
  requirement: { fontSize: 13, color: colors.red, fontWeight: '600' },
  totals: { borderTopWidth: 1, borderTopColor: colors.black, paddingTop: 8, marginTop: 6 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totalLabel: { fontSize: 15 },
  totalValue: { fontSize: 15 },
  pm: { borderWidth: 1, borderColor: colors.black, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, marginRight: 6 },
  pmOn: { backgroundColor: colors.black },
  pmText: { fontSize: 13 },
  simNote: { textAlign: 'center', fontSize: 11, color: colors.muted, marginTop: 6 },
  confirm: { position: 'absolute', left: 20, right: 20, top: 120, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.black, borderRadius: 10, padding: 16 },
  progress: { height: 6, backgroundColor: colors.hairline, borderRadius: 3, marginBottom: 8, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: colors.black },
});
