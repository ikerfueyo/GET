/**
 * LRI 1. The sketch page is blank, so this keeps to the rest of GET: white
 * page, the block logo, black-outlined fields and one black button.
 * On launch (`intro`) the splash logo slides up into place before the fields
 * fade in; once signed in (`leaving`) the fields fade out, the logo slides back
 * down to the splash position and the page darkens like the loading screen.
 */
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Animated, Easing, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from './components/Logo';
import { SPLASH_LOGO, darken } from './LoadingScreen';
import { Button, T } from './components/ui';
import { useAuth } from './state/Auth';
import { colors, fonts } from './theme';

type Mode = 'sign_in' | 'register';

const LOGO = 56;
const native = Platform.OS !== 'web';

export function LoginScreen({ intro, leaving, onLeft }: { intro: boolean; leaving: boolean; onLeft: () => void }) {
  const { signIn, signUp } = useAuth();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>('sign_in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const slide = useRef(new Animated.Value(intro ? 0 : 1)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const dark = useRef(new Animated.Value(0)).current;
  const emailRef = useRef<ComponentRef<typeof TextInput>>(null);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(slide, { toValue: 1, duration: intro ? 650 : 0, delay: intro ? 150 : 0, easing: Easing.inOut(Easing.cubic), useNativeDriver: native }),
      Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: native }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!leaving) return;
    Keyboard.dismiss();
    // the slide lands on the splash position only from the top of the page
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    Animated.sequence([
      Animated.timing(fade, { toValue: 0, duration: 300, useNativeDriver: native }),
      Animated.timing(slide, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.cubic), useNativeDriver: native }),
      darken(dark),
    ]).start(() => onLeft());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  // the splash logo sits centred at SPLASH_LOGO; this page's logo is smaller and near the top
  const logoTop = insets.top + 56;
  const logoTransform = [
    { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [height / 2 - (logoTop + LOGO / 2), 0] }) },
    { scale: slide.interpolate({ inputRange: [0, 1], outputRange: [SPLASH_LOGO / LOGO, 1] }) },
  ];
  const backgroundColor = dark.interpolate({ inputRange: [0, 1], outputRange: ['#FFFFFF', '#000000'] });
  const logoOpacity = dark.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] });

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
    <Animated.View style={[styles.root, { backgroundColor }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.content, { paddingTop: logoTop, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={[styles.logo, { opacity: logoOpacity }]}>
            <Animated.View style={{ transform: logoTransform }}>
              <Logo size={LOGO} />
            </Animated.View>
          </Animated.View>

          <Animated.View style={{ opacity: fade }} pointerEvents={leaving ? 'none' : 'auto'}>
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
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 90 },
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
});
