/**
 * LI 1 / LI 11 / LI 16: the strip of locations at the top of the screen.
 * Tap selects (the icon's circle turns red, globe flies there), Search finds a
 * place, + adds one to the far right. Pressing a location (long-press, or a
 * tap on the one already selected) opens its options under its icon (LI 2 /
 * LI 8): Edit, Share and Save for Here or a searched place, Edit, Share and
 * Delete for a saved one. Edit and Save open LI 3 / LI 4 / LI 9, Delete LI 10.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Share, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { addressLines, type SavedLocation } from '@get/shared';
import { BackIcon, CheckIcon, ChevronIcon, CloseIcon, PlaceIcon, PlusIcon, SearchIcon } from '../components/Icons';
import { StreetMap } from '../components/StreetMap';
import { T } from '../components/ui';
import { geocode, placeSubtitle, searchPlaces, type Place } from '../places';
import { useApp } from '../state/AppState';
import { colors, fonts } from '../theme';

type Icon = SavedLocation['icon'];
type Building = NonNullable<SavedLocation['buildingType']>;

const BUILDINGS: Building[] = ['House', 'Apartment', 'Office', 'Hotel', 'Other'];
const LABEL_ICONS: { icon: Icon; name: string }[] = [
  { icon: 'home', name: 'Home' },
  { icon: 'work', name: 'Work' },
  { icon: 'school', name: 'School' },
  { icon: 'pin', name: 'Other' },
];

/** Here and a searched place are not saved yet; everything else is */
const isCurrent = (l: SavedLocation) => l.icon === 'here' || l.id === 'loc_picked';

const ITEM_W = 56; // strip item width incl. margins
const MENU_W = 170;

function LocationGlyph({ icon, selected, size = 34 }: { icon: Icon; selected: boolean; size?: number }) {
  // each location keeps its own icon; selecting only turns the circle red
  const glyph = Math.round(size * (icon === 'here' ? 0.6 : 0.44));
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: selected ? colors.red : colors.black }]}>
      <PlaceIcon icon={icon} size={glyph} color={colors.white} />
    </View>
  );
}

/** pick = confirm a searched place (LI 14, no label); save = save Here, a searched place or an added one (LI 4 / LI 19) */
type Form = { kind: 'edit' | 'save' | 'pick' | 'delete' | 'share'; loc: SavedLocation };

const placeToLocation = (p: Place): SavedLocation => ({ id: 'loc_new', label: p.name, icon: 'pin', address: p.address, lat: p.lat, lng: p.lng });

export function LocationInterface({ top }: { top: number }) {
  const { locations, selected, selectLocation, pickLocation, saveLocation, updateLocation, removeLocation, recentPlaces, addRecentPlace } = useApp();
  const { width, height } = useWindowDimensions();
  const [mode, setMode] = useState<'strip' | 'search' | 'add'>('strip');
  const [query, setQuery] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [stripW, setStripW] = useState(0);
  const scrollX = useRef(0);
  const scrollLeft = useRef(0); // where the scrolling part starts inside the strip
  const [menuLeft, setMenuLeft] = useState(0);

  // LI 12 / LI 17: what's typed is looked up worldwide (GET's stores and a few cities first)
  const [found, setFound] = useState<Place[]>([]);
  const [looking, setLooking] = useState(false);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const q = query.trim();
    setOffline(false);
    if (mode === 'strip' || q.length < 2) {
      setFound([]);
      setLooking(false);
      return;
    }
    const ctrl = new AbortController();
    setLooking(true);
    const t = setTimeout(() => {
      geocode(q, selected, ctrl.signal)
        .then(setFound)
        .catch(() => {
          if (!ctrl.signal.aborted) setOffline(true);
        })
        .finally(() => !ctrl.signal.aborted && setLooking(false));
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mode]);
  const local = query.trim() ? searchPlaces(query, 4) : [];
  const results = query.trim()
    ? [...local, ...found.filter((f) => !local.some((l) => Math.abs(l.lat - f.lat) < 1e-3 && Math.abs(l.lng - f.lng) < 1e-3))]
    : recentPlaces.length
      ? recentPlaces
      : searchPlaces('');
  const listHeader = query.trim() ? null : recentPlaces.length ? 'Recent' : 'Suggested';

  // LI 13 / LI 18: the chosen place on the street map, to confirm with ✓
  const [preview, setPreview] = useState<Place | null>(null);
  const choose = (p: Place) => {
    addRecentPlace(p);
    setPreview(p);
  };
  const finish = () => {
    setForm(null);
    setPreview(null);
    setMode('strip');
    setQuery('');
  };

  const openMenu = (id: string, index: number) => {
    // centred under the icon that was pressed, kept inside the strip
    const iconCenter = 8 + scrollLeft.current + index * ITEM_W + ITEM_W / 2 - scrollX.current;
    setMenuLeft(Math.max(0, Math.min(iconCenter - MENU_W / 2, stripW - MENU_W)));
    setMenuFor(id);
  };

  const previewMap = preview && (
    <View style={StyleSheet.absoluteFill}>
      <StreetMap
        key={`${preview.lat},${preview.lng}`}
        width={width}
        height={height}
        active
        selected={{ ...preview, icon: 'pin' }}
        enter={{ point: preview, key: 1, streets: true }}
        focus={{ point: preview, key: 1 }}
      />
    </View>
  );

  if (form) {
    return (
      <>
        {form.kind !== 'share' && previewMap}
        <View style={[styles.wrap, { top }]}>
          {form.kind === 'share' ? (
            <LocationShare loc={form.loc} onCancel={() => setForm(null)} />
          ) : (
            <LocationForm
              form={form}
              onCancel={() => setForm(null)}
              onDone={(patch) => {
                if (form.kind === 'edit') updateLocation(form.loc.id, patch);
                else if (form.kind === 'pick') pickLocation(form.loc, form.loc.label, form.loc.address, patch);
                else if (form.kind === 'save') {
                  const { id: _id, ...rest } = { ...form.loc, ...patch };
                  saveLocation({ ...rest, icon: patch.icon ?? 'pin' });
                } else removeLocation(form.loc.id);
                if (preview) finish();
                else setForm(null);
              }}
            />
          )}
        </View>
      </>
    );
  }

  if (preview) {
    return (
      <>
        {previewMap}
        <View style={[styles.wrap, { top }]}>
          <View style={styles.searchRow}>
            <Pressable onPress={() => setPreview(null)} hitSlop={10} accessibilityLabel="Back">
              <BackIcon size={20} />
            </Pressable>
            <T numberOfLines={1} style={styles.previewTitle}>
              {preview.name}
            </T>
            <Pressable
              onPress={() => setForm({ kind: mode === 'search' ? 'pick' : 'save', loc: placeToLocation(preview) })}
              hitSlop={10}
              accessibilityLabel="Use this location"
            >
              <CheckIcon size={22} />
            </Pressable>
          </View>
        </View>
      </>
    );
  }

  if (mode !== 'strip') {
    return (
      <View style={[styles.wrap, { top }]}>
        <View style={styles.searchRow}>
          <Pressable onPress={() => setMode('strip')} hitSlop={10} accessibilityLabel="Back">
            <BackIcon size={20} />
          </Pressable>
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={mode === 'search' ? 'Search here' : 'Add a location'}
            returnKeyType="search"
            autoCorrect={false}
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <Pressable onPress={() => setQuery('')} hitSlop={10} style={styles.clear} accessibilityLabel="Clear">
            <CloseIcon size={10} color={colors.white} />
          </Pressable>
        </View>
        <FlatList
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          data={results}
          keyExtractor={(p, i) => `${i}:${p.name}:${p.address}`}
          renderItem={({ item }) => (
            <Pressable onPress={() => choose(item)} style={styles.row}>
              <T numberOfLines={1} style={styles.rowTitle}>
                {item.name}
              </T>
              <T numberOfLines={1} style={styles.rowSub}>
                {placeSubtitle(item)}
              </T>
            </Pressable>
          )}
          ListHeaderComponent={listHeader ? <T style={styles.listHeader}>{listHeader}</T> : undefined}
          ListFooterComponent={
            looking ? (
              <ActivityIndicator color={colors.white} style={{ margin: 12 }} />
            ) : offline ? (
              <T style={styles.listHeader}>Can't search the whole world right now. Showing GET's places.</T>
            ) : query.trim().length >= 2 && !results.length ? (
              <T style={styles.listHeader}>No places found</T>
            ) : undefined
          }
        />
      </View>
    );
  }

  const menuLoc = locations.find((l) => l.id === menuFor);
  const close = () => setMenuFor(null);

  return (
    <View style={[styles.wrap, { top }]}>
      <View style={styles.strip} onLayout={(e) => setStripW(e.nativeEvent.layout.width)}>
        <Pressable onPress={() => setMode('search')} style={styles.searchBtn} accessibilityLabel="Search locations">
          <SearchIcon size={20} />
        </Pressable>
        <View style={styles.sep} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ alignItems: 'center' }}
          onLayout={(e) => (scrollLeft.current = e.nativeEvent.layout.x - 8)}
          onScroll={(e) => {
            scrollX.current = e.nativeEvent.contentOffset.x;
            if (menuFor) close();
          }}
          scrollEventThrottle={32}
        >
          {locations.map((loc, i) => {
            const isSel = loc.id === selected.id;
            return (
              <Pressable
                key={loc.id}
                onPress={() => {
                  if (isSel) return menuFor === loc.id ? close() : openMenu(loc.id, i);
                  close();
                  selectLocation(loc.id);
                }}
                onLongPress={() => openMenu(loc.id, i)}
                style={styles.item}
                accessibilityLabel={`${loc.label}${isSel ? ', selected' : ''}`}
              >
                <LocationGlyph icon={loc.icon} selected={isSel} />
                <T numberOfLines={1} style={[styles.label, isSel && { fontWeight: '700' }]}>
                  {loc.label}
                </T>
              </Pressable>
            );
          })}
          <Pressable onPress={() => setMode('add')} style={styles.add} accessibilityLabel="Add location">
            <PlusIcon size={20} />
          </Pressable>
        </ScrollView>
      </View>

      {menuLoc ? (
        <View style={[styles.menu, { left: menuLeft }]}>
          <View style={styles.menuHead}>
            {addressLines(menuLoc.address).map((line, i) => (
              <T key={i} style={styles.menuAddress}>
                {line}
              </T>
            ))}
          </View>
          <MenuItem
            label="Edit"
            onPress={() => {
              close();
              setForm({ kind: 'edit', loc: menuLoc });
            }}
          />
          <MenuItem
            label="Share"
            onPress={() => {
              close();
              setForm({ kind: 'share', loc: menuLoc });
            }}
          />
          {isCurrent(menuLoc) ? (
            <MenuItem
              label="Save"
              last
              onPress={() => {
                close();
                setForm({ kind: 'save', loc: menuLoc });
              }}
            />
          ) : (
            <MenuItem
              label="Delete"
              danger
              last
              onPress={() => {
                close();
                setForm({ kind: 'delete', loc: menuLoc });
              }}
            />
          )}
        </View>
      ) : (
        <View style={styles.addressBar}>
          <T numberOfLines={1} style={styles.address}>
            {selected.label} · {selected.address}
          </T>
        </View>
      )}
    </View>
  );
}

function MenuItem({ label, onPress, danger, last }: { label: string; onPress: () => void; danger?: boolean; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.menuItem, last && { borderBottomWidth: 0 }]}>
      <T style={[styles.menuText, danger && { color: colors.red }]}>{label}</T>
    </Pressable>
  );
}

/**
 * LI 3 (edit Here), LI 4 (save Here or a searched place), LI 9 (edit a saved
 * place) and LI 10 (delete one). Cancel | the location's icon | Save (or Delete).
 */
function LocationForm({ form, onCancel, onDone }: { form: Form; onCancel: () => void; onDone: (patch: Partial<Omit<SavedLocation, 'id'>>) => void }) {
  const { kind, loc } = form;
  const firstLine = loc.address.split(',')[0].trim();
  const [building, setBuilding] = useState<Building | undefined>(loc.buildingType);
  const [pickBuilding, setPickBuilding] = useState(false);
  const [details, setDetails] = useState(loc.details ?? '');
  // saving: Other by default, named after the address's first line (Here) or the place
  const [icon, setIcon] = useState<Icon>(kind === 'save' ? 'pin' : loc.icon);
  const [name, setName] = useState(kind === 'save' ? (loc.icon === 'here' ? firstLine : loc.label) : loc.label);
  const withLabel = kind === 'save' || (kind === 'edit' && !isCurrent(loc));
  const shown: Icon = kind === 'delete' ? loc.icon : withLabel ? icon : loc.icon;
  const label = name.trim() || LABEL_ICONS.find((l) => l.icon === icon)?.name || loc.label;
  const patch: Partial<Omit<SavedLocation, 'id'>> = {
    buildingType: building,
    details: details.trim() || undefined,
    ...(withLabel ? { icon, label } : {}),
  };
  // an edit can only be saved once it would change something (changing a box back counts as no change)
  const changed =
    building !== loc.buildingType || (patch.details ?? '') !== (loc.details ?? '') || (withLabel && (icon !== loc.icon || label !== loc.label));
  const canSubmit = kind !== 'edit' || changed;

  const header = (
    <View style={styles.formHead}>
      <Pressable onPress={onCancel} hitSlop={8} style={styles.headBtn} accessibilityLabel="Cancel">
        <T style={styles.headText}>Cancel</T>
      </Pressable>
      <View style={styles.headCenter}>
        <LocationGlyph icon={shown} selected size={34} />
        <T numberOfLines={1} style={styles.headLabel}>
          {(withLabel && name.trim()) || loc.label}
        </T>
      </View>
      <Pressable
        onPress={() => onDone(kind === 'delete' ? {} : patch)}
        disabled={!canSubmit}
        hitSlop={8}
        style={[styles.headBtn, styles.doneBtn, kind === 'delete' && { backgroundColor: colors.red }, !canSubmit && styles.doneOff]}
        accessibilityLabel={kind === 'delete' ? 'Delete' : 'Save'}
        accessibilityState={{ disabled: !canSubmit }}
      >
        <T style={[styles.headText, { color: colors.white, fontWeight: '700' }]}>{kind === 'delete' ? 'Delete' : 'Save'}</T>
      </Pressable>
    </View>
  );

  if (kind === 'delete') {
    return (
      <View style={styles.form}>
        {header}
        {/* the address on its lines, centred under the icon */}
        <View style={styles.deleteAddress}>
          {addressLines(loc.address).map((line, i) => (
            <T key={i} style={styles.deleteText}>
              {line}
            </T>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.form}>
      {header}
      <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingBottom: 10 }} keyboardShouldPersistTaps="handled">
        {/* the address comes from the map, so it is shown, not edited */}
        <View style={styles.addressBlock} accessibilityLabel={`Address: ${loc.address}`}>
          {addressLines(loc.address).map((line, i) => (
            <T key={i} style={styles.addressLine}>
              {line}
            </T>
          ))}
        </View>

        <T style={styles.fieldLabel}>Building type</T>
        <Pressable onPress={() => setPickBuilding((v) => !v)} style={styles.field} accessibilityLabel="Building type">
          <T style={[styles.fieldText, !building && { color: colors.muted }]}>{building ?? 'Choose'}</T>
          <View style={{ transform: [{ rotate: pickBuilding ? '-90deg' : '90deg' }] }}>
            <ChevronIcon size={14} />
          </View>
        </Pressable>
        {pickBuilding && (
          <View style={styles.dropdown}>
            {BUILDINGS.map((b) => (
              <Pressable
                key={b}
                onPress={() => {
                  setBuilding(b);
                  setPickBuilding(false);
                }}
                style={styles.dropRow}
              >
                <T style={[styles.fieldText, b === building && { fontWeight: '700' }]}>{b}</T>
              </Pressable>
            ))}
          </View>
        )}

        <T style={styles.fieldLabel}>Additional details</T>
        <TextInput
          value={details}
          onChangeText={setDetails}
          placeholder="e.g. House number or name"
          placeholderTextColor={colors.muted}
          style={[styles.field, styles.fieldText]}
        />

        {withLabel && (
          <>
            <T style={styles.fieldLabel}>Label</T>
            <View style={styles.labelRow}>
              {LABEL_ICONS.map((l) => {
                const on = l.icon === icon;
                return (
                  <Pressable
                    key={l.icon}
                    onPress={() => setIcon(l.icon)}
                    style={[styles.chip, on && { backgroundColor: colors.black }]}
                    accessibilityLabel={l.name}
                  >
                    <PlaceIcon icon={l.icon} size={12} color={on ? colors.white : colors.black} />
                    <T style={[styles.chipText, on && { color: colors.white }]}>{l.name}</T>
                  </Pressable>
                );
              })}
            </View>
            <View style={[styles.field, { paddingRight: 6 }]}>
              <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={colors.muted} style={[styles.fieldText, { flex: 1 }]} />
              <Pressable onPress={() => setName('')} hitSlop={8} style={styles.clear} accessibilityLabel="Clear name">
                <CloseIcon size={9} color={colors.white} />
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * LI 5: share a location. A header (Cancel, its icon and name) and its card
 * (address on black beside a capture of its streets) show while the phone's own
 * share sheet is open, and go away with it.
 * What is shared is the place, not the user's name for it: the address, building
 * type and details, under the plain Other pin.
 */
function LocationShare({ loc, onCancel }: { loc: SavedLocation; onCancel: () => void }) {
  const shared = { ...loc, icon: 'pin' as const };
  const address = addressLines(loc.address);
  const lines = [...address, loc.buildingType, loc.details].filter((l): l is string => !!l);
  const mapView = useRef({ point: { lat: loc.lat, lng: loc.lng }, key: 1, streets: true }).current;
  useEffect(() => {
    const link = `https://maps.google.com/?q=${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}`;
    Share.share({ title: 'Location from GET', message: [...lines, link].join('\n') })
      .catch(() => {})
      .finally(onCancel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.form, styles.shareForm]}>
      {/* only on this screen: which of your places this is, and a way out */}
      <View style={[styles.formHead, styles.shareHead]}>
        <Pressable onPress={onCancel} hitSlop={8} style={styles.headBtn} accessibilityLabel="Cancel">
          <T style={styles.headText}>Cancel</T>
        </Pressable>
        <View style={styles.headCenter}>
          <LocationGlyph icon={loc.icon} selected size={34} />
          <T numberOfLines={1} style={styles.headLabel}>
            {loc.label}
          </T>
        </View>
        <View style={styles.headBtn} />
      </View>
      {/* the card fills the rest of the panel, edge to edge */}
      <View style={[styles.shareCard, { height: Math.max(SHARE_MAP_H, 26 + lines.length * 17) }]} accessibilityLabel="Location being shared">
        <View style={styles.shareAddress}>
          {lines.map((line, i) => (
            <T key={i} style={[styles.shareAddressLine, i >= address.length && styles.shareExtra, i === address.length && { marginTop: 6 }]}>
              {line}
            </T>
          ))}
        </View>
        <View style={styles.shareMap} pointerEvents="none">
          <StreetMap width={SHARE_MAP_W} height={SHARE_MAP_H} active={false} selected={shared} enter={mapView} focus={mapView} mini />
        </View>
      </View>
    </View>
  );
}

const SHARE_MAP_W = 150;
const SHARE_MAP_H = 120;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 10, right: 10, zIndex: 20 },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.black,
    height: 62,
    paddingHorizontal: 8,
  },
  searchBtn: { width: 34, height: 44, alignItems: 'center', justifyContent: 'center' },
  sep: { width: 1.5, height: 40, backgroundColor: colors.black, marginHorizontal: 6 },
  item: { width: ITEM_W - 4, alignItems: 'center', marginHorizontal: 2 },
  circle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 10, marginTop: 2, maxWidth: ITEM_W - 4 },
  add: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  addressBar: { alignSelf: 'center', marginTop: 6, backgroundColor: colors.black, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, maxWidth: '90%' },
  address: { fontSize: 12, color: colors.white },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.black,
    height: 50,
    paddingHorizontal: 10,
    gap: 8,
  },
  input: { flex: 1, fontSize: 18, fontFamily: fonts.sans, color: colors.ink, height: 40 },
  clear: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' },
  // LI 11 / LI 16: the results are a dark list under the search bar
  list: { maxHeight: 460, marginTop: 6, backgroundColor: colors.black, borderRadius: 10, borderWidth: 1, borderColor: colors.black },
  listHeader: { fontSize: 12, color: colors.hairline, paddingHorizontal: 12, paddingVertical: 8 },
  row: { paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#333' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.white },
  rowSub: { fontSize: 12, color: colors.hairline },
  previewTitle: { flex: 1, fontSize: 18, fontWeight: '600' },
  menu: { position: 'absolute', top: 66, width: MENU_W, backgroundColor: colors.white, borderRadius: 8, borderWidth: 1, borderColor: colors.black, overflow: 'hidden' },
  menuHead: { backgroundColor: colors.black, paddingHorizontal: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.black },
  menuAddress: { fontSize: 12, color: colors.white },
  menuItem: { paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  menuText: { fontSize: 15 },
  form: { backgroundColor: colors.panel, borderRadius: 10, borderWidth: 1, borderColor: colors.black, padding: 10 },
  formHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headBtn: { minWidth: 64, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 6 },
  doneBtn: { backgroundColor: colors.black, alignItems: 'center' },
  doneOff: { backgroundColor: colors.muted },
  headText: { fontSize: 15 },
  deleteAddress: { alignSelf: 'center', marginTop: 10, marginBottom: 6 },
  deleteText: { fontSize: 13, textAlign: 'center' },
  shareForm: { padding: 0, overflow: 'hidden' },
  shareHead: { padding: 10, paddingBottom: 15 },
  shareCard: { flexDirection: 'row', height: SHARE_MAP_H, borderTopWidth: 1, borderTopColor: colors.black },
  shareAddress: { flex: 1, backgroundColor: colors.black, justifyContent: 'center', paddingHorizontal: 14 },
  shareAddressLine: { color: colors.white, fontSize: 13, fontWeight: '600', lineHeight: 17 },
  shareExtra: { fontWeight: '400' }, // building type and details, under the address
  shareMap: { width: SHARE_MAP_W, alignSelf: 'stretch', justifyContent: 'center', backgroundColor: colors.white },
  headCenter: { alignItems: 'center', flex: 1, marginHorizontal: 6 },
  headLabel: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  addressBlock: { marginTop: 22, marginBottom: 10 },
  addressLine: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  fieldLabel: { fontSize: 15, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.white, borderRadius: 6, borderWidth: 1, borderColor: colors.black, paddingHorizontal: 10, height: 38 },
  fieldText: { fontSize: 15, fontFamily: fonts.sans, color: colors.ink },
  dropdown: { backgroundColor: colors.white, borderRadius: 6, borderWidth: 1, borderColor: colors.black, marginTop: 2 },
  dropRow: { paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  labelRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.black, backgroundColor: colors.white },
  chipText: { fontSize: 12 },
});
