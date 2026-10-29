/**
 * HS 1: the globe is always the background; the upper interfaces open over it
 * from the side bar, and the Search Interface sits at the bottom. Zooming into
 * the globe cross-fades into a flat satellite map at the same scale, which turns
 * into the black-and-white street map (HS 2) at street level; pinching out of
 * it fades back to the globe.
 */
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LatLng } from '@get/shared';
import { Globe } from './components/Globe';
import { SideBar } from './components/SideBar';
import { StreetMap } from './components/StreetMap';
import { T } from './components/ui';
import { AccountInterface } from './interfaces/AccountInterface';
import { LocationInterface } from './interfaces/LocationInterface';
import { OrdersInterface } from './interfaces/OrdersInterface';
import { SearchInterface, type SearchHandle } from './interfaces/SearchInterface';
import { useApp } from './state/AppState';
import { colors } from './theme';

export function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { selected, focusKey, pickLocation, panel, setPanel, toast } = useApp();
  const searchRef = useRef<SearchHandle>(null);

  const [street, setStreet] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const keys = useRef(0);
  const [enter, setEnter] = useState<{ point: LatLng; key: number; scale?: number; streets?: boolean }>({ point: selected, key: 0 });
  const [globeFocus, setGlobeFocus] = useState<{ point: LatLng; zoom?: number; key: number }>({ point: selected, key: 0 });
  useEffect(() => {
    if (focusKey) setGlobeFocus({ point: selected, key: ++keys.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  const showStreet = (on: boolean) => {
    setStreet(on);
    Animated.timing(fade, { toValue: on ? 1 : 0, duration: on ? 450 : 550, useNativeDriver: Platform.OS !== 'web' }).start();
  };
  const dive = (center: LatLng, scale: number, byPin: boolean) => {
    setEnter({ point: center, key: ++keys.current, scale, streets: byPin });
    showStreet(true);
  };
  const surface = (center: LatLng) => {
    // land back on the globe a little zoomed out from where the streets were
    setGlobeFocus({ point: center, zoom: 3, key: ++keys.current });
    showStreet(false);
  };

  const searchCollapsed = 72 + insets.bottom;
  const top = insets.top + 8;
  const panelTop = insets.top + 6;
  const mapHeight = height - searchCollapsed + 14;

  return (
    <View style={styles.root}>
      <View style={StyleSheet.absoluteFill} pointerEvents={street ? 'none' : 'auto'}>
        <Globe
          width={width}
          height={mapHeight}
          selected={selected}
          focus={globeFocus}
          onPick={(p) => pickLocation(p)}
          onDive={dive}
        />
      </View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} pointerEvents={street ? 'auto' : 'none'}>
        <StreetMap
          width={width}
          height={mapHeight}
          active={street}
          selected={selected}
          enter={enter}
          focus={{ point: selected, key: focusKey }}
          onPick={(p) => pickLocation(p)}
          onExit={surface}
        />
      </Animated.View>
      {street && <StatusBar style="dark" />}

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {panel === 'location' && <LocationInterface top={top} />}
        {panel === 'orders' && (
          <OrdersInterface
            top={panelTop}
            bottom={searchCollapsed - 14}
            onAddItem={() => {
              setPanel(null);
              searchRef.current?.expand();
            }}
          />
        )}
        {panel === 'account' && <AccountInterface top={panelTop} bottom={searchCollapsed - 14} />}
      </View>

      <SideBar top={top + (panel === 'location' ? 96 : 40)} bounds={{ width, height }} />

      <SearchInterface ref={searchRef} collapsed={searchCollapsed} full={height - insets.top} bottomInset={insets.bottom} />

      {toast && (
        <View style={[styles.toast, { bottom: searchCollapsed + 12 }]} pointerEvents="none">
          <T style={styles.toastText}>{toast}</T>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.black,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    zIndex: 60,
    maxWidth: '90%',
  },
  toastText: { fontSize: 14, fontWeight: '600' },
});
