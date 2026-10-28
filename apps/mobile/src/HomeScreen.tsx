/**
 * HS 1: the globe is always the background; the upper interfaces open over it
 * from the side bar, and the Search Interface sits at the bottom.
 */
import { useRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Globe } from './components/Globe';
import { SideBar } from './components/SideBar';
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

  const searchCollapsed = 72 + insets.bottom;
  const top = insets.top + 8;
  const panelTop = insets.top + 6;

  return (
    <View style={styles.root}>
      <Globe
        width={width}
        height={height - searchCollapsed + 14}
        selected={selected}
        focus={{ point: selected, key: focusKey }}
        onPick={(p) => pickLocation(p)}
      />

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
