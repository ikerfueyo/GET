/**
 * LI 1 / LI 11 / LI 16: the strip of locations at the top of the screen.
 * Tap selects (the icon's circle turns red, globe flies there), Search finds a
 * place, + adds one to the far right. Pressing a location (long-press, or a
 * tap on the one already selected) opens its options under its icon (LI 2 /
 * LI 8): Share and Save for Here, Edit, Share and Save for a searched place,
 * Edit, Share and Delete for a saved one. Edit and Save open LI 3 / LI 4 / LI 9, Delete LI 10.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Share, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { addressLines, formatAddress, missingParts, type AddressParts, type LatLng, type PlaceKind, type SavedLocation } from '@get/shared';
import { BackIcon, CheckIcon, ChevronIcon, CloseIcon, PlaceIcon, PlusIcon, SearchIcon } from '../components/Icons';
import { StreetMap } from '../components/StreetMap';
import { T } from '../components/ui';
import { fallbackOutline, fetchOutline, geocode, partsOf, placeSubtitle, reverseGeocode, searchPlaces, type Place } from '../places';
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
const SEARCH_W = 34;
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

/**
 * save = save Here, a searched place or an added one (LI 4 / LI 19).
 * `moved` is what the map screen changed before an edit: address, pin or outline.
 */
type Form = { kind: 'edit' | 'save' | 'delete' | 'share'; loc: SavedLocation; moved?: Partial<SavedLocation>; fromMap?: boolean };

/** a place on the map screen, with what was filled in under its address */
type Spot = Place & Pick<SavedLocation, 'buildingType' | 'details'>;

const placeToLocation = (p: Spot): SavedLocation => ({
  id: 'loc_new',
  label: p.name,
  icon: 'pin',
  address: p.address,
  lat: p.lat,
  lng: p.lng,
  ...(p.kind === 'area' && p.area ? { area: p.area } : {}),
  ...(p.buildingType ? { buildingType: p.buildingType } : {}),
  ...(p.details ? { details: p.details } : {}),
});

/** a saved place back on the map screen: an outline, or no street, makes it an area */
const locationToPlace = (l: SavedLocation): Spot => {
  const parts = partsOf(l);
  const kind = l.area || !parts.street ? 'area' : 'point';
  return { name: l.label, address: l.address, parts, lat: l.lat, lng: l.lng, kind, area: l.area, buildingType: l.buildingType, details: l.details };
};

/** the centre and zoom that show the whole outline */
function fitArea(area: LatLng[], width: number, height: number): { point: LatLng; zoom: number } {
  const merc = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
  const unmerc = (y: number) => (Math.atan(Math.exp(Math.PI * (1 - 2 * y))) * 360) / Math.PI - 90;
  const xs = area.map((c) => (c.lng + 180) / 360);
  const ys = area.map((c) => merc(c.lat));
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const zoom = Math.log2(Math.min((width * 0.75) / ((x1 - x0 || 1e-6) * 512), (height * 0.4) / ((y1 - y0 || 1e-6) * 512)));
  return { point: { lat: unmerc((y0 + y1) / 2), lng: ((x0 + x1) / 2) * 360 - 180 }, zoom: Math.max(2.2, Math.min(17, zoom)) };
}

export function LocationInterface({ top, onCover }: { top: number; onCover?: (covered: boolean) => void }) {
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
  // where the place ends up: its pin can be dragged (or an area's outline reshaped) and its address corrected before ✓
  const [spot, setSpot] = useState<Spot | null>(null);
  const [editAddress, setEditAddress] = useState(false);
  // a saved place opened from its Edit option comes to this same screen first
  const [editing, setEditing] = useState<SavedLocation | null>(null);
  const [view, setView] = useState<{ point: LatLng; key: number; zoom?: number }>({ point: { lat: 0, lng: 0 }, key: 0 });
  const open = (p: Spot, from: SavedLocation | null = null) => {
    const kind: PlaceKind = p.kind ?? 'point';
    setPreview(p);
    setSpot({ ...p, kind, parts: partsOf(p) });
    setEditing(from);
    setEditAddress(false);
    // a point flies down to its streets; an area waits for its outline, then fits it on screen
    if (kind === 'point') setView({ point: p, key: 1 });
    else if (p.area) setView({ ...fitArea(p.area, width, height), key: 1 });
    else setView({ point: p, key: 0 });
  };
  const choose = (p: Place) => {
    addRecentPlace(p);
    open(p);
  };
  useEffect(() => {
    if (!preview || preview.kind !== 'area' || preview.area) return;
    const ctrl = new AbortController();
    const done = (area: LatLng[]) => {
      if (ctrl.signal.aborted) return;
      setSpot((s) => (s ? { ...s, area } : s));
      setView({ ...fitArea(area, width, height), key: 1 });
    };
    fetchOutline(preview, ctrl.signal)
      .then((a) => done(a ?? fallbackOutline(preview)))
      .catch(() => done(fallbackOutline(preview)));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);
  const finish = () => {
    setForm(null);
    setPreview(null);
    setSpot(null);
    setEditing(null);
    setMode('strip');
    setQuery('');
  };
  const moveSpot = useMovablePin((p) => setSpot((s) => (s ? { ...s, ...p } : s)), (place) =>
    // the searched name stays on top; only the address follows the pin
    setSpot((s) => (s ? { ...s, address: place.address, parts: place.parts, lat: place.lat, lng: place.lng } : s)),
  );

  // anything bigger than the strip and its menu covers the side bar's spot
  const covered = mode !== 'strip' || !!form || !!preview;
  useEffect(() => {
    onCover?.(covered);
    return () => onCover?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [covered]);

  /** `index` in the scrolling part, or null for the searched place before the divider */
  const openMenu = (id: string, index: number | null) => {
    // centred under the icon that was pressed, kept inside the strip
    const iconCenter = index === null ? 8 + SEARCH_W + ITEM_W / 2 : 8 + scrollLeft.current + index * ITEM_W + ITEM_W / 2 - scrollX.current;
    setMenuLeft(Math.max(0, Math.min(iconCenter - MENU_W / 2, stripW - MENU_W)));
    setMenuFor(id);
  };

  const isArea = spot?.kind === 'area';
  const previewMap = preview && spot && (
    <View style={StyleSheet.absoluteFill}>
      <StreetMap
        key={`${preview.lat},${preview.lng}`}
        width={width}
        height={height}
        active
        selected={{ lat: spot.lat, lng: spot.lng, icon: editing?.icon ?? 'pin' }}
        enter={{ ...view, streets: true }}
        focus={view}
        area={isArea ? spot.area : undefined}
        // the pin or outline moves only before ✓; once the panel is open it stays put
        {...(form
          ? {}
          : isArea
            ? { onAreaDrag: (area: LatLng[]) => setSpot((s) => (s ? { ...s, area } : s)) }
            : { onPinDrag: moveSpot.drag, onPinDrop: moveSpot.drop })}
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
                // an edit's changes from the map screen go in with the rest
                if (form.kind === 'edit') updateLocation(form.loc.id, patch);
                else if (form.kind === 'save') {
                  const { id: _id, ...rest } = { ...form.loc, ...patch };
                  saveLocation({ ...rest, icon: patch.icon ?? 'pin' });
                } else removeLocation(form.loc.id);
                if (preview) finish();
                else setForm(null);
                setEditing(null);
              }}
            />
          )}
        </View>
      </>
    );
  }

  if (preview && spot) {
    const parts = spot.parts ?? partsOf(spot);
    const ok = missingParts(parts, spot.kind).length === 0 && (!isArea || !!spot.area);
    const confirm = () => {
      if (editing) {
        // Edit: what changed here rides along to the details panel
        const moved: Partial<SavedLocation> = {};
        if (spot.address !== editing.address) moved.address = spot.address;
        if (spot.lat !== editing.lat || spot.lng !== editing.lng) Object.assign(moved, { lat: spot.lat, lng: spot.lng });
        const area = isArea ? spot.area : undefined;
        if (JSON.stringify(area) !== JSON.stringify(editing.area)) moved.area = area;
        if (spot.buildingType !== editing.buildingType) moved.buildingType = spot.buildingType;
        if ((spot.details ?? '') !== (editing.details ?? '')) moved.details = spot.details;
        setForm({ kind: 'edit', loc: editing, moved, fromMap: true });
      } else if (mode === 'search') {
        // Search only selects the place (LI 14)
        pickLocation(spot, spot.name, spot.address, { area: isArea ? spot.area : undefined, buildingType: spot.buildingType, details: spot.details });
        finish();
      } else setForm({ kind: 'save', loc: placeToLocation(spot), fromMap: true }); // Add goes on to the save panel (LI 19)
    };
    const caption = isArea
      ? spot.area
        ? 'Drag the corners to reshape the area'
        : 'Finding the area…'
      : moveSpot.busy
        ? 'Finding the address…'
        : 'Drag the pin to adjust the location';
    const hint = ok || (isArea && !spot.area) ? caption : `${caption} · Tap Edit to finish the address`;
    return (
      <>
        {previewMap}
        <View style={[styles.wrap, { top }]}>
          <View style={styles.searchRow}>
            <Pressable
              onPress={() => {
                setPreview(null);
                setSpot(null);
                if (editing) finish();
              }}
              hitSlop={10}
              accessibilityLabel="Back"
            >
              <BackIcon size={20} />
            </Pressable>
            <T numberOfLines={1} style={styles.previewTitle}>
              {spot.name}
            </T>
            <Pressable
              onPress={confirm}
              disabled={!ok}
              hitSlop={10}
              style={!ok && { opacity: 0.35 }}
              accessibilityLabel="Use this location"
              accessibilityState={{ disabled: !ok }}
            >
              <CheckIcon size={22} />
            </Pressable>
          </View>
          {editAddress ? (
            <View style={[styles.form, styles.previewPanel]}>
              <View style={styles.previewPanelHead}>
                <Pressable onPress={() => setEditAddress(false)} hitSlop={8} style={[styles.headBtn, styles.doneBtn]} accessibilityLabel="Done editing address">
                  <T style={[styles.headText, { color: colors.white, fontWeight: '700' }]}>Done</T>
                </Pressable>
              </View>
              <ScrollView style={{ maxHeight: height * 0.62 }} keyboardShouldPersistTaps="handled">
                <AddressEditor
                  parts={parts}
                  kind={spot.kind ?? 'point'}
                  onChange={(p) => setSpot({ ...spot, parts: p, address: formatAddress(p) })}
                  building={spot.buildingType}
                  onBuilding={(buildingType) => setSpot({ ...spot, buildingType })}
                  details={spot.details}
                  onDetails={(details) => setSpot({ ...spot, details })}
                />
              </ScrollView>
            </View>
          ) : (
            <Pressable onPress={() => setEditAddress(true)} style={styles.previewAddress} accessibilityLabel={`Address: ${spot.address}. Edit`}>
              <View style={{ flex: 1 }}>
                {addressLines(spot.address).map((line, i) => (
                  <T key={i} style={styles.menuAddress}>
                    {line}
                  </T>
                ))}
              </View>
              <T style={styles.previewEdit}>Edit</T>
            </Pressable>
          )}
          {!editAddress && <T style={styles.dragHint}>{hint}</T>}
        </View>
      </>
    );
  }

  if (mode !== 'strip') {
    return (
      <View style={[styles.wrap, { top }]}>
        <View style={styles.searchRow}>
          <Pressable
            onPress={() => {
              // leaving Search or Add forgets what was typed
              setMode('strip');
              setQuery('');
            }}
            hitSlop={10}
            accessibilityLabel="Back"
          >
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
  // a searched place sits between Search and the divider (LI 15); the rest scroll after it
  const searched = locations.find((l) => l.id === 'loc_picked');
  const strip = locations.filter((l) => l.id !== 'loc_picked');
  const renderItem = (loc: SavedLocation, i: number | null) => {
    const isSel = loc.id === selected.id;
    const open = () => openMenu(loc.id, i);
    return (
      <Pressable
        key={loc.id}
        onPress={() => {
          if (isSel) return menuFor === loc.id ? close() : open();
          close();
          selectLocation(loc.id);
        }}
        onLongPress={open}
        style={styles.item}
        accessibilityLabel={`${loc.label}${isSel ? ', selected' : ''}`}
      >
        <LocationGlyph icon={loc.icon} selected={isSel} />
        <T numberOfLines={1} style={[styles.label, isSel && { fontWeight: '700' }]}>
          {loc.label}
        </T>
      </Pressable>
    );
  };
  const close = () => setMenuFor(null);

  return (
    <View style={[styles.wrap, { top }]}>
      <View style={styles.strip} onLayout={(e) => setStripW(e.nativeEvent.layout.width)}>
        <Pressable onPress={() => setMode('search')} style={styles.searchBtn} accessibilityLabel="Search locations">
          <SearchIcon size={20} />
        </Pressable>
        {searched && renderItem(searched, null)}
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
          {strip.map((loc, i) => renderItem(loc, i))}
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
          {/* Here follows the phone, so there is nothing to edit: only Share and Save */}
          {menuLoc.icon !== 'here' && (
            <MenuItem
              label="Edit"
              onPress={() => {
                close();
                open(locationToPlace(menuLoc), menuLoc);
              }}
            />
          )}
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

/** A pin being dragged: it follows the finger, and where it is let go its address is looked up. */
function useMovablePin(onMove: (p: LatLng) => void, onFound: (place: Place) => void) {
  const [busy, setBusy] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const on = useRef({ onMove, onFound });
  on.current = { onMove, onFound };
  useEffect(() => () => ctrl.current?.abort(), []);
  return {
    busy,
    drag: (p: LatLng) => on.current.onMove(p),
    drop: (p: LatLng) => {
      on.current.onMove(p);
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      setBusy(true);
      reverseGeocode(p, c.signal)
        // offline the pin still moves, and the address can be typed
        .then((place) => place && !c.signal.aborted && on.current.onFound({ ...place, lat: p.lat, lng: p.lng }))
        .catch(() => {})
        .finally(() => ctrl.current === c && setBusy(false));
    },
  };
}

const ADDRESS_FIELDS: { key: keyof AddressParts; label: string }[] = [
  { key: 'street', label: 'Street address' },
  { key: 'neighborhood', label: 'Neighborhood or district' },
  { key: 'city', label: 'City' },
  { key: 'region', label: 'State / Province' },
  { key: 'postcode', label: 'ZIP code' },
  { key: 'country', label: 'Country' },
];

/**
 * The address in its parts. An exact place needs every box but the
 * neighborhood or district. An area (a
 * neighborhood or district, city, state/province or country) has no street or
 * ZIP code, and needs every box broader than its first filled one. Missing
 * boxes are outlined in red.
 */
function AddressEditor({
  parts,
  kind,
  onChange,
  building,
  onBuilding,
  details,
  onDetails,
}: {
  parts: AddressParts;
  kind: PlaceKind;
  onChange: (p: AddressParts) => void;
  building?: Building;
  onBuilding: (b: Building | undefined) => void;
  details?: string;
  onDetails: (d: string | undefined) => void;
}) {
  const missing = missingParts(parts, kind);
  const box = ({ key, label }: (typeof ADDRESS_FIELDS)[number]) => (
    <View key={key} style={{ flex: 1 }}>
      <T style={styles.partLabel}>{label}</T>
      <TextInput
        value={parts[key]}
        onChangeText={(v) => onChange({ ...parts, [key]: v })}
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        style={[styles.field, styles.fieldText, missing.includes(key) && styles.fieldMissing]}
        accessibilityLabel={label}
      />
    </View>
  );
  const [street, hood, city, region, postcode, country] = ADDRESS_FIELDS;
  const point = kind === 'point';
  return (
    <View style={{ gap: 6 }}>
      {point && (
        <>
          {/* an exact place's building and how to find it, right under its street */}
          {box(street)}
          <BuildingField value={building} onChange={onBuilding} small />
          <DetailsFields value={details} onChange={onDetails} small />
        </>
      )}
      {box(hood)}
      {box(city)}
      {point ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {box(region)}
          {box(postcode)}
        </View>
      ) : (
        box(region)
      )}
      {box(country)}
      {missing.length > 0 && <T style={styles.missingNote}>{point ? 'An exact place needs every box but the neighborhood or district.' : 'An area needs every box below the first one filled.'}</T>}
    </View>
  );
}

function BuildingField({ value, onChange, small }: { value?: Building; onChange: (b: Building | undefined) => void; small?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <T style={small ? styles.partLabel : styles.fieldLabel}>Building type</T>
      <Pressable onPress={() => setOpen((v) => !v)} style={styles.field} accessibilityLabel="Building type">
        <T style={[styles.fieldText, !value && { color: colors.muted }]}>{value ?? 'Choose'}</T>
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
          <ChevronIcon size={14} />
        </View>
      </Pressable>
      {open && (
        <View style={styles.dropdown}>
          {BUILDINGS.map((b) => (
            <Pressable
              key={b}
              onPress={() => {
                onChange(b);
                setOpen(false);
              }}
              style={styles.dropRow}
            >
              <T style={[styles.fieldText, b === value && { fontWeight: '700' }]}>{b}</T>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Additional details, one box per line of `value`. Once the first box has
 * something in it a second appears; emptying the first moves the second up
 * (or removes the empty second), back to a single "Additional details".
 */
function DetailsFields({ value, onChange, small }: { value?: string; onChange: (d: string | undefined) => void; small?: boolean }) {
  const filled = (value ?? '').split('\n').filter(Boolean).slice(0, 2);
  const boxes = filled.length < 2 ? [...filled, ''] : filled;
  const set = (i: number, v: string) => {
    const next = boxes.map((b, j) => (j === i ? v.replace(/\n/g, ' ') : b)).filter(Boolean);
    onChange(next.length ? next.join('\n') : undefined);
  };
  return (
    <>
      {boxes.map((b, i) => (
        <View key={i}>
          <T style={small ? styles.partLabel : styles.fieldLabel}>{boxes.length > 1 ? `Additional details ${i + 1}` : 'Additional details'}</T>
          <TextInput
            value={b}
            onChangeText={(v) => set(i, v)}
            placeholder={i === 0 ? 'e.g. House number or name' : undefined}
            placeholderTextColor={colors.muted}
            style={[styles.field, styles.fieldText]}
            accessibilityLabel={boxes.length > 1 ? `Additional details ${i + 1}` : 'Additional details'}
          />
        </View>
      ))}
    </>
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
  const { kind, loc, moved = {}, fromMap } = form;
  const { height } = useWindowDimensions();
  const address = moved.address ?? loc.address;
  const firstLine = loc.address.split(',')[0].trim();
  // coming from the map screen they were already filled in there, under the address
  const [building, setBuilding] = useState<Building | undefined>('buildingType' in moved ? moved.buildingType : loc.buildingType);
  const [details, setDetails] = useState<string | undefined>('details' in moved ? moved.details : loc.details);
  // saving: Other by default, named after the address's first line (Here) or the place
  const [icon, setIcon] = useState<Icon>(kind === 'save' ? 'pin' : loc.icon);
  const [name, setName] = useState(kind === 'save' ? (loc.icon === 'here' ? firstLine : loc.label) : loc.label);
  const withLabel = kind === 'save' || (kind === 'edit' && !isCurrent(loc));
  const shown: Icon = kind === 'delete' ? loc.icon : withLabel ? icon : loc.icon;
  const label = name.trim() || LABEL_ICONS.find((l) => l.icon === icon)?.name || loc.label;
  const patch: Partial<Omit<SavedLocation, 'id'>> = {
    buildingType: building,
    details: details?.trim() || undefined,
    ...(withLabel ? { icon, label } : {}),
    ...moved,
  };
  // an edit can only be saved once it would change something (changing a box back counts as no change)
  const changed =
    building !== loc.buildingType ||
    (patch.details ?? '') !== (loc.details ?? '') ||
    (withLabel && (icon !== loc.icon || label !== loc.label)) ||
    Object.keys(moved).length > 0;
  const canSubmit = kind !== 'edit' || changed;
  const submitLabel = kind === 'delete' ? 'Delete' : 'Save';

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
        accessibilityLabel={submitLabel}
        accessibilityState={{ disabled: !canSubmit }}
      >
        <T style={[styles.headText, { color: colors.white, fontWeight: '700' }]}>{submitLabel}</T>
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
      <ScrollView style={{ maxHeight: Math.max(460, height * 0.68) }} contentContainerStyle={{ paddingBottom: 10 }} keyboardShouldPersistTaps="handled">
        <T style={styles.fieldLabel}>Address</T>
        {/* set on the map screen (Here's comes from the phone), so it is shown, not edited */}
        <View style={styles.addressBlock} accessibilityLabel={`Address: ${address}`}>
          {addressLines(address).map((line, i) => (
            <T key={i} style={styles.addressLine}>
              {line}
            </T>
          ))}
        </View>

        {!fromMap && (
          <>
            <BuildingField value={building} onChange={setBuilding} />
            <DetailsFields value={details} onChange={setDetails} />
          </>
        )}

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
  const lines = [...address, loc.buildingType, ...(loc.details ?? '').split('\n')].filter((l): l is string => !!l);
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
  searchBtn: { width: SEARCH_W, height: 44, alignItems: 'center', justifyContent: 'center' },
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
  addressBlock: {},
  partLabel: { fontSize: 12, color: colors.muted, marginBottom: 2 },
  fieldMissing: { borderColor: colors.red, borderWidth: 1.5 },
  missingNote: { fontSize: 12, color: colors.red },
  previewAddress: { flexDirection: 'row', alignItems: 'center', marginTop: 6, backgroundColor: colors.black, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  previewEdit: { color: colors.white, fontSize: 14, fontWeight: '700', marginLeft: 10 },
  previewPanel: { marginTop: 6 },
  previewPanelHead: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 2 },
  dragHint: { alignSelf: 'center', marginTop: 6, backgroundColor: colors.black, color: colors.white, fontSize: 12, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
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
