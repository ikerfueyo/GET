/**
 * HS 1: the globe is always the background; the upper interfaces open over it
 * from the side bar, and the Search Interface sits at the bottom. Zooming into
 * the globe cross-fades into a flat satellite map at the same scale, which turns
 * into the black-and-white street map (HS 2) at street level; pinching out of
 * it fades back to the globe.
 * Once `revealed`, the screen fades in while the side bar slides in from the
 * left and the Search Interface rises from the bottom.
 */
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
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

export function HomeScreen({ revealed = true }: { revealed?: boolean }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { selected, focusKey, panel, setPanel, toast } = useApp();
  const searchRef = useRef<SearchHandle>(null);

  const intro = useRef(new Animated.Value(revealed ? 1 : 0)).current;
  useEffect(() => {
    if (revealed) Animated.timing(intro, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [revealed, intro]);

  const [street, setStreet] = useState(false);
  const [locationOverlay, setLocationOverlay] = useState(false);
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
  // open Orders/Account float like the Location strip: same side gap, and the same gap above the collapsed Search
  const panelBottom = searchCollapsed + 10;
  const mapHeight = height - searchCollapsed + 14;

  return (
    <View style={styles.root} pointerEvents={revealed ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: intro }]} pointerEvents="box-none">
        <View style={StyleSheet.absoluteFill} pointerEvents={street ? 'none' : 'auto'}>
          <Globe
            width={width}
            height={mapHeight}
            selected={selected}
            focus={globeFocus}
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
            onExit={surface}
          />
        </Animated.View>
        {street && <StatusBar style="dark" />}

        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {panel === 'location' && <LocationInterface top={top} onOverlay={setLocationOverlay} />}
          {panel === 'orders' && (
            <OrdersInterface
              top={panelTop}
              bottom={panelBottom}
              onAddItem={() => {
                setPanel(null);
                searchRef.current?.expand();
              }}
            />
          )}
          {panel === 'account' && <AccountInterface top={panelTop} bottom={panelBottom} />}
        </View>
      </Animated.View>

      <SideBar hidden={panel === 'location' && locationOverlay} top={top + (panel === 'location' ? 96 : 40)} bounds={{ width, height }} slideX={intro.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] })} />

      <SearchInterface
        ref={searchRef}
        collapsed={searchCollapsed}
        full={height - insets.top}
        bottomInset={insets.bottom}
        slideY={intro.interpolate({ inputRange: [0, 1], outputRange: [searchCollapsed + 20, 0] })}
      />

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
