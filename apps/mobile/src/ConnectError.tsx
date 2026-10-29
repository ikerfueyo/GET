/** Shown when GET can't reach Supabase at launch: the catalogue only lives there. */
import { StyleSheet, View } from 'react-native';
import { Logo } from './components/Logo';
import { Button, T } from './components/ui';
import { colors } from './theme';

export function ConnectError({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.root}>
      <Logo size={72} />
      <T style={styles.title}>Can't connect to GET</T>
      <T style={styles.sub}>Check your internet connection and try again.</T>
      <Button label="Try again" onPress={onRetry} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, zIndex: 95 },
  title: { fontSize: 20, fontWeight: '700', marginTop: 32, marginBottom: 8 },
  sub: { fontSize: 15, color: colors.muted, textAlign: 'center', marginBottom: 24 },
});
