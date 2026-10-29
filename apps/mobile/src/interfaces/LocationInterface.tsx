/**
 * LI 1 / LI 11 / LI 16: the strip of locations at the top of the screen.
 * Tap selects (icon turns red, globe flies there), Search finds a place,
 * + adds one to the far right, long-press shows options.
 */
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import type { SavedLocation } from '@get/shared';
import { BackIcon, CloseIcon, HomeIcon, PinIcon, PlusIcon, SearchIcon, WorkIcon } from '../components/Icons';
import { T } from '../components/ui';
import { searchPlaces, type Place } from '../places';
import { useApp } from '../state/AppState';
import { colors, fonts } from '../theme';

function LocationGlyph({ loc, selected }: { loc: SavedLocation; selected: boolean }) {
  const fg = colors.white;
  if (loc.icon === 'here' || selected) {
    // the red ring, same as the pin on the globe
    return (
      <View style={[styles.circle, { backgroundColor: selected ? colors.red : colors.black }]}>
        <View style={styles.ring} />
      </View>
    );
  }
  return (
    <View style={styles.circle}>
      {loc.icon === 'home' ? <HomeIcon size={15} color={fg} /> : loc.icon === 'work' ? <WorkIcon size={15} color={fg} /> : <PinIcon size={15} color={fg} />}
    </View>
  );
}

export function LocationInterface({ top }: { top: number }) {
  const { locations, selected, selectLocation, pickLocation, saveLocation } = useApp();
  const [mode, setMode] = useState<'strip' | 'search' | 'add'>('strip');
  const [query, setQuery] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);

  const visible = locations.filter((l) => !removed.includes(l.id));
  const results = searchPlaces(query);

  const choose = (p: Place) => {
    if (mode === 'search') pickLocation(p, p.name, p.address);
    else saveLocation({ label: p.name, icon: 'pin', address: p.address, lat: p.lat, lng: p.lng });
    setMode('strip');
    setQuery('');
  };

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
          keyExtractor={(p) => p.name + p.address}
          renderItem={({ item }) => (
            <Pressable onPress={() => choose(item)} style={styles.row}>
              <T style={styles.rowTitle}>{item.name}</T>
              <T style={styles.rowSub}>{item.address}</T>
            </Pressable>
          )}
          ListHeaderComponent={!query ? <T style={styles.listHeader}>{mode === 'search' ? 'Suggested' : 'Pick a place to save'}</T> : undefined}
        />
      </View>
    );
  }

  const menuLoc = visible.find((l) => l.id === menuFor);

  return (
    <View style={[styles.wrap, { top }]}>
      <View style={styles.strip}>
        <Pressable onPress={() => setMode('search')} style={styles.searchBtn} accessibilityLabel="Search locations">
          <SearchIcon size={20} />
        </Pressable>
        <View style={styles.sep} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
          {visible.map((loc) => {
            const isSel = loc.id === selected.id;
            return (
              <Pressable
                key={loc.id}
                onPress={() => {
                  setMenuFor(null);
                  selectLocation(loc.id);
                }}
                onLongPress={() => setMenuFor(loc.id)}
                style={styles.item}
                accessibilityLabel={`${loc.label}${isSel ? ', selected' : ''}`}
              >
                <LocationGlyph loc={loc} selected={isSel} />
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

      <View style={styles.addressBar}>
        <T numberOfLines={1} style={styles.address}>
          {selected.label} · {selected.address}
        </T>
      </View>

      {menuLoc && (
        <View style={styles.menu}>
          {menuLoc.id === 'loc_picked' && (
            <MenuItem
              label="Save"
              onPress={() => {
                saveLocation({ ...menuLoc, label: menuLoc.label === 'Pinned' ? 'Saved' : menuLoc.label });
                setMenuFor(null);
              }}
            />
          )}
          <MenuItem
            label="Share"
            onPress={() => {
              Share.share({ message: `${menuLoc.label}: ${menuLoc.address} (${menuLoc.lat.toFixed(5)}, ${menuLoc.lng.toFixed(5)})` }).catch(() => {});
              setMenuFor(null);
            }}
          />
          {menuLoc.icon !== 'here' && menuLoc.id !== 'loc_picked' && (
            <MenuItem
              label="Delete"
              danger
              onPress={() => {
                setRemoved((r) => [...r, menuLoc.id]);
                // if the deleted one was selected, Here becomes the selection
                if (menuLoc.id === selected.id) selectLocation('loc_here');
                setMenuFor(null);
              }}
            />
          )}
        </View>
      )}
    </View>
  );
}

function MenuItem({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={styles.menuItem}>
      <T style={[styles.menuText, danger && { color: colors.red }]}>{label}</T>
    </Pressable>
  );
}

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
  item: { width: 52, alignItems: 'center', marginHorizontal: 2 },
  circle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.black,
  },
  ring: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.white },
  label: { fontSize: 10, marginTop: 2, maxWidth: 52 },
  add: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  addressBar: { alignSelf: 'center', marginTop: 6, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, maxWidth: '90%' },
  address: { fontSize: 12 },
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
  list: { maxHeight: 420, marginTop: 6, backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: colors.black },
  listHeader: { fontSize: 12, color: colors.muted, paddingHorizontal: 12, paddingTop: 8 },
  row: { paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowSub: { fontSize: 12, color: colors.muted },
  menu: { position: 'absolute', top: 64, left: 70, backgroundColor: colors.white, borderRadius: 8, borderWidth: 1, borderColor: colors.black, overflow: 'hidden' },
  menuItem: { paddingHorizontal: 16, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  menuText: { fontSize: 15 },
});
