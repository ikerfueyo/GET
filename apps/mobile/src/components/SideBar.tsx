/**
 * The three upper-interface buttons (Location, Orders, Account).
 * Behaves like iOS AssistiveTouch: drag it anywhere, it fades when idle.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet } from 'react-native';
import { useApp } from '../state/AppState';
import { colors } from '../theme';
import { CartIcon, PersonIcon, PinIcon } from './Icons';

const IDLE_OPACITY = 0.45;

/** `slideX` offsets the bar horizontally, for the Home Screen's entrance. */
export function SideBar({ top, bounds, slideX }: { top: number; bounds: { width: number; height: number }; slideX?: Animated.AnimatedInterpolation<number> }) {
  const { panel, setPanel } = useApp();
  const pos = useRef(new Animated.ValueXY({ x: 10, y: top })).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wake = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: false }).start();
    idleTimer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: IDLE_OPACITY, duration: 600, useNativeDriver: false }).start();
    }, 3500);
  };

  useEffect(() => {
    wake();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);

  // keep clear of the Location strip when it opens
  useEffect(() => {
    pos.y.stopAnimation((y) => {
      if (y < top) Animated.spring(pos.y, { toValue: top, useNativeDriver: false }).start();
    });
  }, [top, pos]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        // only steal the touch once it is clearly a drag, so taps reach the buttons
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 8,
        onPanResponderGrant: () => {
          wake();
          pos.extractOffset();
        },
        onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], { useNativeDriver: false }),
        onPanResponderRelease: () => {
          pos.flattenOffset();
          // snap to the nearest side edge, like AssistiveTouch
          const x = (pos.x as unknown as { _value: number })._value;
          const y = (pos.y as unknown as { _value: number })._value;
          Animated.spring(pos, {
            toValue: {
              x: x + 22 < bounds.width / 2 ? 10 : bounds.width - 54,
              y: Math.max(top, Math.min(bounds.height - 260, y)),
            },
            useNativeDriver: false,
          }).start();
          wake();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bounds.width, bounds.height, top],
  );

  const items = [
    { key: 'location' as const, Icon: PinIcon, label: 'Location', accent: colors.red },
    { key: 'orders' as const, Icon: CartIcon, label: 'Orders', accent: colors.green },
    { key: 'account' as const, Icon: PersonIcon, label: 'Account', accent: colors.blue },
  ];

  return (
    <Animated.View style={[styles.bar, { transform: [...pos.getTranslateTransform(), ...(slideX ? [{ translateX: slideX }] : [])], opacity }]} {...responder.panHandlers}>
      {items.map(({ key, Icon, label, accent }, i) => {
        const active = panel === key;
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={`${label} interface`}
            accessibilityState={{ selected: active }}
            onPress={() => {
              wake();
              setPanel(active ? null : key);
            }}
            style={[styles.btn, i > 0 && styles.divider]}
          >
            <Icon size={18} color={active ? accent : colors.black} />
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 34,
    backgroundColor: colors.white,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.line,
    zIndex: 30,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  btn: { height: 34, alignItems: 'center', justifyContent: 'center' },
  divider: { borderTopWidth: 1, borderTopColor: colors.hairline },
});
