/**
 * The Search Interface: always at the bottom of the Home Screen. Drag it up
 * (or tap the bar) to expand over everything. Results follow the
 * Product-Oriented Search Concept: picture, name, store, price, rating,
 * S/P/D availability and ETA, ranked by the shared optimal-offer engine.
 */
import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Animated, FlatList, Keyboard, PanResponder, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import {
  MODE_LABEL,
  MODE_LETTER,
  formatEta,
  formatMoney,
  planBundle,
  search,
  suggest,
  type Mode,
  type OfferOption,
  type ProductResult,
  type SortKey,
} from '@get/shared';
import { BackIcon, CloseIcon, RobotIcon, StarIcon } from '../components/Icons';
import { Button, Chip, ModeBadges, T } from '../components/ui';
import { useApp } from '../state/AppState';
import { colors, fonts } from '../theme';

export interface SearchHandle {
  expand: () => void;
}

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'best', label: 'Best' },
  { key: 'price', label: 'Price' },
  { key: 'eta', label: 'ETA' },
  { key: 'rating', label: 'Rating' },
];

export const SearchInterface = forwardRef<SearchHandle, { collapsed: number; full: number; bottomInset: number }>(function SearchInterface(
  { collapsed, full, bottomInset },
  ref,
) {
  const { selected } = useApp();
  const height = useRef(new Animated.Value(collapsed)).current;
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [assistant, setAssistant] = useState(false);
  const [sort, setSort] = useState<SortKey>('best');
  const [modes, setModes] = useState<Mode[]>([]);
  const [urgent, setUrgent] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  const animateTo = (open: boolean) => {
    setExpanded(open);
    Animated.spring(height, { toValue: open ? full : collapsed, useNativeDriver: false, bounciness: 2 }).start();
    if (!open) Keyboard.dismiss();
  };
  useImperativeHandle(ref, () => ({ expand: () => animateTo(true) }));

  const drag = useRef({ start: collapsed });
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          height.stopAnimation((v) => (drag.current.start = v));
        },
        onPanResponderMove: (_e, g) => height.setValue(Math.max(collapsed, Math.min(full, drag.current.start - g.dy))),
        onPanResponderRelease: (_e, g) => {
          const v = drag.current.start - g.dy;
          animateTo(g.vy < -0.3 || (g.vy < 0.3 && v > (collapsed + full) / 2));
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [collapsed, full],
  );

  const isBundle = assistant || query.includes('+');
  const results = useMemo(
    () => (isBundle || query.trim().length < 2 ? [] : search({ query, location: selected, sort, modes, urgent })),
    [query, selected, sort, modes, urgent, isBundle],
  );
  const suggestions = useMemo(() => (expanded && !isBundle ? suggest(query) : []), [query, expanded, isBundle]);

  const toggleMode = (m: Mode) => setModes((ms) => (ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m]));

  return (
    <Animated.View style={[styles.sheet, { height, paddingBottom: bottomInset }]}>
      <View {...responder.panHandlers} style={styles.handleZone}>
        <View style={styles.handle} />
      </View>

      <View style={styles.barRow}>
        {expanded && (
          <Pressable onPress={() => animateTo(false)} hitSlop={10} style={{ marginRight: 6 }} accessibilityLabel="Collapse search">
            <BackIcon size={20} />
          </Pressable>
        )}
        <View style={styles.field}>
          <TextInput
            ref={input}
            value={query}
            onChangeText={setQuery}
            onFocus={() => animateTo(true)}
            placeholder={assistant ? 'Ask GET… e.g. barbecue for 8 people' : 'Search GET'}
            placeholderTextColor="#6B6B6B"
            style={[styles.input, !query && styles.placeholderCenter]}
            returnKeyType="search"
            accessibilityLabel="Search GET"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8} style={styles.clear}>
              <CloseIcon size={9} color={colors.white} />
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={() => {
            setAssistant((a) => !a);
            animateTo(true);
            setTimeout(() => input.current?.focus(), 50);
          }}
          style={[styles.robot, assistant && { backgroundColor: colors.black }]}
          accessibilityLabel="GET assistant"
        >
          <RobotIcon size={22} color={assistant ? colors.white : colors.black} />
        </Pressable>
      </View>

      {expanded && (
        <View style={{ flex: 1 }}>
          {suggestions.length > 0 && query.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestRow} keyboardShouldPersistTaps="handled">
              {suggestions.map((s) => (
                <Chip key={s} label={s} onPress={() => setQuery(s)} />
              ))}
            </ScrollView>
          )}

          {!isBundle && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} keyboardShouldPersistTaps="handled">
              {SORTS.map((s) => (
                <Chip key={s.key} label={s.label} active={sort === s.key} onPress={() => setSort(s.key)} />
              ))}
              <View style={styles.vsep} />
              {(['in_store', 'pickup', 'delivery'] as Mode[]).map((m) => (
                <Chip key={m} label={MODE_LABEL[m]} active={modes.includes(m)} onPress={() => toggleMode(m)} />
              ))}
              <Chip label="Urgent" active={urgent} onPress={() => setUrgent((u) => !u)} />
            </ScrollView>
          )}

          {isBundle ? (
            <Bundle text={query} />
          ) : (
            <FlatList
              data={results}
              keyExtractor={(r) => r.product.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => <ResultRow result={item} />}
              ListEmptyComponent={<Empty query={query} onPick={setQuery} />}
            />
          )}
        </View>
      )}
    </Animated.View>
  );
});

function Empty({ query, onPick }: { query: string; onPick: (q: string) => void }) {
  const ideas = ['baseball bat', 'chicken salad', 'airpods', 'blackboard screws', 'latte', 'charcoal + ribeye steak'];
  return (
    <View style={{ padding: 16 }}>
      <T style={{ color: colors.muted, marginBottom: 10 }}>
        {query.trim().length >= 2 ? `Nothing matches “${query}” near this location yet.` : 'Anything, anywhere. Try:'}
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {ideas.map((i) => (
          <Chip key={i} label={i} onPress={() => onPick(i)} />
        ))}
      </View>
    </View>
  );
}

function ResultRow({ result }: { result: ProductResult }) {
  const { buyNow, addToCart } = useApp();
  const [open, setOpen] = useState(false);
  const { product: p, best } = result;
  return (
    <View style={styles.result}>
      <Pressable style={styles.resultMain} onPress={() => setOpen((o) => !o)} accessibilityLabel={`${p.name}, ${formatMoney(best.total, best.currency)}`}>
        <View style={styles.pic}>
          <T style={{ fontSize: 34 }}>{p.glyph}</T>
        </View>
        <View style={{ flex: 1, paddingHorizontal: 8 }}>
          <T style={styles.name} numberOfLines={2}>
            {p.name}
          </T>
          <View style={styles.storePill}>
            <T style={styles.storePillText} numberOfLines={1}>
              {best.storeName}
              {best.storeVerified ? ' ✓' : ''}
            </T>
          </View>
        </View>
        <View style={styles.priceCol}>
          <T style={styles.price}>{formatMoney(best.total, best.currency)}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <StarIcon size={18} />
            <T style={styles.rating}>{best.rating.toFixed(1)}</T>
          </View>
        </View>
        <View style={styles.modeCol}>
          <ModeBadges available={result.modes} chosen={best.mode} />
          <T style={styles.eta}>{formatEta(best.etaMinutes)}</T>
        </View>
      </Pressable>
      {p.requirements.length > 0 && <T style={styles.req}>⚠ {p.requirements.join(' · ')}</T>}
      {open && (
        <View style={styles.options}>
          <T style={styles.desc}>{p.description}</T>
          {result.options.slice(0, 6).map((o, i) => (
            <OptionRow key={o.offerId + o.mode} o={o} best={i === 0} onGet={() => buyNow(o.offerId, o.mode)} onAdd={() => addToCart(o.offerId, o.mode)} />
          ))}
        </View>
      )}
    </View>
  );
}

function OptionRow({ o, best, onGet, onAdd }: { o: OfferOption; best: boolean; onGet: () => void; onAdd: () => void }) {
  return (
    <View style={styles.option}>
      <View style={[styles.optMode, best && { backgroundColor: colors.black }]}>
        <T style={[{ fontWeight: '700' }, best && { color: colors.white }]}>{MODE_LETTER[o.mode]}</T>
      </View>
      <View style={{ flex: 1 }}>
        <T style={{ fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
          {o.storeName}
        </T>
        <T style={styles.optSub} numberOfLines={1}>
          {MODE_LABEL[o.mode]} · {formatEta(o.etaMinutes)} · {o.storeKind === 'online' ? 'ships' : `${o.distanceKm} km`}
          {o.fee > 0 ? ` · fee ${formatMoney(o.fee, o.storeCurrency)}` : ''}
        </T>
      </View>
      <T style={{ fontWeight: '700', marginRight: 8 }}>{formatMoney(o.total, o.currency)}</T>
      <Pressable onPress={onAdd} style={styles.addBtn} accessibilityLabel="Add to cart">
        <T style={{ fontWeight: '700' }}>+</T>
      </Pressable>
      <Pressable onPress={onGet} style={styles.getBtn} accessibilityLabel="GET it now">
        <T style={styles.getText}>GET</T>
      </Pressable>
    </View>
  );
}

/** "+" lists and the assistant: one best option per item, one total. */
function Bundle({ text }: { text: string }) {
  const { selected, addToCart } = useApp();
  const plan = useMemo(() => (text.trim() ? planBundle(text) : null), [text]);
  const rows = useMemo(
    () =>
      (plan?.items ?? []).map((item) => {
        const [r] = search({ query: item.query, location: selected, limit: 1 });
        return { item, r };
      }),
    [plan, selected],
  );
  if (!plan) {
    return (
      <View style={{ padding: 16 }}>
        <T style={{ color: colors.muted }}>Describe what you need (“barbecue for 8 people”, “party for 12”) or list items separated by “+”.</T>
      </View>
    );
  }
  const found = rows.filter((x) => x.r);
  const totalUSD = found.reduce((s, x) => s + x.r!.best.total * x.item.quantity, 0);
  return (
    <ScrollView contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
      <T style={{ fontSize: 22, fontWeight: '700', marginBottom: 6 }}>{plan.title}</T>
      {rows.map(({ item, r }) => (
        <View key={item.query} style={styles.bundleRow}>
          <T style={{ width: 28, fontWeight: '700' }}>{item.quantity}×</T>
          <View style={{ flex: 1 }}>
            <T numberOfLines={1}>{r ? r.product.name : item.query}</T>
            <T style={styles.optSub} numberOfLines={1}>
              {r ? `${r.best.storeName} · ${MODE_LABEL[r.best.mode]} · ${formatEta(r.best.etaMinutes)}` : 'not found nearby'}
              {item.why ? ` · ${item.why}` : ''}
            </T>
          </View>
          {r && <T style={{ fontWeight: '700' }}>{formatMoney(r.best.total * item.quantity, r.best.currency)}</T>}
        </View>
      ))}
      <View style={[styles.bundleRow, { borderBottomWidth: 0 }]}>
        <T style={{ flex: 1, fontWeight: '700', fontSize: 16 }}>Total</T>
        <T style={{ fontWeight: '700', fontSize: 16 }}>{formatMoney(totalUSD, 'USD')}</T>
      </View>
      <Button
        label="Add all to carts"
        disabled={found.length === 0}
        onPress={() => found.forEach(({ item, r }) => Array.from({ length: item.quantity }, () => addToCart(r!.best.offerId, r!.best.mode)))}
      />
      <T style={[styles.optSub, { marginTop: 6, textAlign: 'center' }]}>Items from different stores go into one cart per store.</T>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    zIndex: 40,
    overflow: 'hidden',
  },
  handleZone: { height: 18, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.black },
  barRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8 },
  field: {
    flex: 1,
    height: 40,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: '#8A8A8A',
    borderRadius: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: { flex: 1, height: 40, paddingHorizontal: 10, fontFamily: fonts.mono, fontSize: 15, color: colors.ink },
  placeholderCenter: { textAlign: 'center' },
  clear: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  robot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    backgroundColor: colors.white,
  },
  suggestRow: { flexGrow: 0, paddingHorizontal: 12, marginBottom: 6 },
  filterRow: { flexGrow: 0, paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: 1.5, borderBottomColor: colors.black },
  vsep: { width: 1, backgroundColor: colors.black, marginHorizontal: 4, marginRight: 10 },
  result: { borderBottomWidth: 1.5, borderBottomColor: colors.black },
  resultMain: { flexDirection: 'row', alignItems: 'center', padding: 10 },
  pic: { width: 64, height: 64, borderWidth: 1, borderColor: colors.black, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, lineHeight: 19 },
  storePill: { alignSelf: 'flex-start', marginTop: 5, backgroundColor: '#EDEDED', borderWidth: 1, borderColor: colors.black, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, maxWidth: 140 },
  storePillText: { fontSize: 11, fontWeight: '600' },
  priceCol: { alignItems: 'flex-start', width: 92 },
  price: { fontSize: 19, fontWeight: '700' },
  rating: { fontSize: 18 },
  modeCol: { alignItems: 'center', width: 62 },
  eta: { fontSize: 14, marginTop: 4, textAlign: 'center' },
  req: { color: colors.red, fontSize: 12, paddingHorizontal: 10, paddingBottom: 6, fontWeight: '600' },
  options: { paddingHorizontal: 10, paddingBottom: 10 },
  desc: { fontSize: 13, color: colors.muted, marginBottom: 6 },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.hairline },
  optMode: { width: 24, height: 24, borderWidth: 1, borderColor: colors.black, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  optSub: { fontSize: 11, color: colors.muted },
  addBtn: { width: 30, height: 30, borderWidth: 1, borderColor: colors.black, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  getBtn: { height: 30, paddingHorizontal: 12, backgroundColor: colors.black, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  getText: { color: colors.white, fontWeight: '800', letterSpacing: 1 },
  bundleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.hairline, gap: 6 },
});
