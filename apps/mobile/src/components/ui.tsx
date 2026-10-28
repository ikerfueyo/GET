import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import { MODE_LETTER, MODES, type Mode } from '@get/shared';
import { colors, fonts } from '../theme';

export function T({ style, ...rest }: TextProps & { style?: StyleProp<TextStyle> }) {
  return <Text {...rest} style={[{ fontFamily: fonts.sans, color: colors.ink }, style]} />;
}

/**
 * S / P / D strip, as in the Product-Oriented Search Concept: grey shades only,
 * dark = can be gotten that way (in-store / pickup / delivery), light = not offered.
 */
export function ModeBadges({ available, size = 20 }: { available: Record<Mode, boolean>; size?: number }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {MODES.map((m, i) => {
        const on = available[m];
        return (
          <View
            key={m}
            accessibilityLabel={`${MODE_LETTER[m]} ${on ? 'available' : 'not available'}`}
            style={[styles.badge, { width: size, height: size, marginLeft: i ? -1 : 0 }, on ? styles.badgeOn : styles.badgeOff]}
          >
            <T style={[styles.badgeText, { fontSize: size * 0.6 }, { color: on ? colors.white : colors.muted }]}>{MODE_LETTER[m]}</T>
          </View>
        );
      })}
    </View>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  style,
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        kind === 'primary' && { backgroundColor: colors.black },
        kind === 'secondary' && { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.black },
        kind === 'danger' && { backgroundColor: colors.red },
        (pressed || disabled) && { opacity: 0.6 },
        style,
      ]}
    >
      <T style={[styles.btnText, kind === 'secondary' && { color: colors.black }]}>{label}</T>
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && { backgroundColor: colors.black }]}>
      <T style={[styles.chipText, active && { color: colors.white }]}>{label}</T>
    </Pressable>
  );
}

export function SectionHeader({ title, onPress, right }: { title: string; onPress?: () => void; right?: ReactNode }) {
  return (
    <Pressable onPress={onPress} style={styles.section}>
      <T style={styles.sectionTitle}>{title}</T>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: { borderWidth: 1, borderColor: colors.black, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  badgeOn: { backgroundColor: colors.ink, borderColor: colors.white },
  badgeOff: { backgroundColor: colors.shadeOff, borderColor: colors.hairline },
  badgeText: { fontWeight: '700' },
  btn: { height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  btnText: { color: colors.white, fontWeight: '700', fontSize: 16, letterSpacing: 0.3 },
  chip: { paddingHorizontal: 12, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.black, justifyContent: 'center', marginRight: 6, backgroundColor: colors.white },
  chipText: { fontSize: 13, fontWeight: '600' },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 6 },
  sectionTitle: { fontSize: 20, fontWeight: '400' },
});
