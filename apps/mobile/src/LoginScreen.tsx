/**
 * LRI 1. The sketch page is blank, so this keeps to the rest of GET: white
 * page, the block logo, black-outlined fields and one black button.
 */
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from './components/Logo';
import { Button, T } from './components/ui';
import { useAuth } from './state/Auth';
import { colors, fonts } from './theme';

type Mode = 'sign_in' | 'register';

export function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('sign_in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const emailRef = useRef<ComponentRef<typeof TextInput>>(null);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, [fade]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = mode === 'sign_in' ? await signIn(email, password) : await signUp(name, email, password);
      setError(res.error);
      if (res.notice) {
        setNotice(res.notice);
        setMode('sign_in');
      }
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Animated.View style={[styles.root, { opacity: fade }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logo}>
            <Logo size={84} />
          </View>

          <View style={styles.tabs} accessibilityRole="tablist">
            {(['sign_in', 'register'] as const).map((m) => (
              <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} onPress={() => switchMode(m)} style={[styles.tab, mode === m && styles.tabOn]}>
                <T style={[styles.tabText, mode === m && { color: colors.white }]}>{m === 'sign_in' ? 'Sign in' : 'Register'}</T>
              </Pressable>
            ))}
          </View>

          {mode === 'register' && (
            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor={colors.muted}
              value={name}
              onChangeText={setName}
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
            />
          )}
          <TextInput
            ref={emailRef}
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.muted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType={mode === 'register' ? 'username' : 'emailAddress'}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <TextInput
            ref={passwordRef}
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            textContentType={mode === 'register' ? 'newPassword' : 'password'}
            returnKeyType="go"
            onSubmitEditing={submit}
          />

          {error && <T style={styles.error}>{error}</T>}
          {notice && <T style={styles.notice}>{notice}</T>}

          <Button label={busy ? '…' : mode === 'sign_in' ? 'Sign in' : 'Create account'} onPress={submit} disabled={busy} style={{ marginTop: 6 }} />

          <Pressable onPress={() => switchMode(mode === 'sign_in' ? 'register' : 'sign_in')} style={styles.swap}>
            <T style={styles.swapText}>{mode === 'sign_in' ? 'New to GET? Register' : 'Have an account? Sign in'}</T>
          </Pressable>

          <T style={styles.foot}>
            Payments are simulated. No real card is ever charged.
          </T>
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: colors.white, zIndex: 90 },
  content: { flexGrow: 1, paddingHorizontal: 28, maxWidth: 440, width: '100%', alignSelf: 'center' },
  logo: { alignItems: 'center', marginBottom: 44 },
  tabs: { flexDirection: 'row', borderWidth: 1, borderColor: colors.black, borderRadius: 8, overflow: 'hidden', marginBottom: 18 },
  tab: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  tabOn: { backgroundColor: colors.black },
  tabText: { fontSize: 15, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: colors.black, borderRadius: 6, height: 46, paddingHorizontal: 12, marginBottom: 10, fontFamily: fonts.sans, fontSize: 16, color: colors.ink },
  error: { color: colors.red, marginBottom: 6 },
  notice: { color: colors.ink, marginBottom: 6 },
  swap: { alignItems: 'center', paddingVertical: 16 },
  swapText: { fontSize: 14, textDecorationLine: 'underline' },
  foot: { marginTop: 'auto', paddingTop: 24, textAlign: 'center', fontSize: 12, color: colors.muted },
});
