/** LS 1–4: white background gradually turns black around the logo, then the Home Screen fades in. */
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { Logo } from './components/Logo';

export function LoadingScreen({ onDone }: { onDone: () => void }) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(250),
      Animated.timing(t, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.delay(150),
    ]).start(() => onDone());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backgroundColor = t.interpolate({ inputRange: [0, 1], outputRange: ['#FFFFFF', '#000000'] });
  // the black mark disappears into the black background, as in LS 4
  const opacity = t.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] });

  return (
    <Animated.View style={[styles.root, { backgroundColor }]}>
      <Animated.View style={{ opacity }}>
        <Logo size={110} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
});
