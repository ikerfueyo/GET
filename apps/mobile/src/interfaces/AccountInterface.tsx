/**
 * Account Interface, from the notes: Personal info, Wallet, GET Cash,
 * Favorites, Loyalty & rewards, Log out. Payment methods are fake: any
 * Luhn-valid number is accepted (try 4242 4242 4242 4242).
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { formatMoney } from '@get/shared';
import { BackIcon, ChevronIcon } from '../components/Icons';
import { Button, T } from '../components/ui';
import { useApp } from '../state/AppState';
import { useAuth } from '../state/Auth';
import { colors, fonts } from '../theme';

type Page = 'home' | 'personal' | 'wallet' | 'cash' | 'favorites' | 'loyalty';

const PAGES: { key: Page; label: string }[] = [
  { key: 'personal', label: 'Personal info' },
  { key: 'wallet', label: 'Wallet' },
  { key: 'cash', label: 'GET Cash' },
  { key: 'favorites', label: 'Favorites' },
  { key: 'loyalty', label: 'Loyalty & rewards' },
];

export function AccountInterface({ top, bottom }: { top: number; bottom: number }) {
  const [page, setPage] = useState<Page>('home');
  const { user, signOut } = useAuth();

  return (
    <View style={[styles.panel, { top, bottom }]}>
      {page === 'home' ? (
        <ScrollView>
          <View style={styles.profile}>
            <View style={styles.avatar}>
              <T style={styles.avatarText}>{(user?.name || user?.email || 'G').charAt(0).toUpperCase()}</T>
            </View>
            <View style={{ flex: 1 }}>
              <T style={styles.name} numberOfLines={1}>{user?.name || 'Guest'}</T>
              <T style={styles.sub} numberOfLines={1}>{user?.email ? `${user.email} · simulated payments` : 'Demo account · simulated payments'}</T>
            </View>
          </View>
          {PAGES.map((p) => (
            <Pressable key={p.key} style={styles.row} onPress={() => setPage(p.key)}>
              <T style={styles.rowText}>{p.label}</T>
              <ChevronIcon size={16} />
            </Pressable>
          ))}
          {/* back to the Login/Register screen; App drops this account's state */}
          <Pressable style={styles.row} onPress={signOut}>
            <T style={[styles.rowText, { color: colors.red }]}>Log out</T>
          </Pressable>
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <Pressable style={styles.back} onPress={() => setPage('home')}>
            <BackIcon size={18} />
            <T style={styles.backText}>{PAGES.find((p) => p.key === page)?.label}</T>
          </Pressable>
          <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
            {page === 'wallet' && <Wallet />}
            {page === 'cash' && <GetCash />}
            {page === 'personal' && <Personal />}
            {page === 'favorites' && <T style={styles.empty}>Tap ♡ on a product or store in search to keep it here.</T>}
            {page === 'loyalty' && <T style={styles.empty}>Store loyalty programs you join will appear here and apply automatically at checkout.</T>}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function Wallet() {
  const { paymentMethods, defaultPaymentId, setDefaultPayment, addCard } = useApp();
  const [number, setNumber] = useState('');
  const [exp, setExp] = useState('');
  const [cvc, setCvc] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const [mm, yy] = exp.split('/').map((s) => Number(s.trim()));
    const err = addCard({ number, expMonth: mm, expYear: yy < 100 ? 2000 + yy : yy, cvc });
    setError(err);
    if (!err) {
      setNumber('');
      setExp('');
      setCvc('');
    }
  };

  return (
    <View>
      {paymentMethods.map((pm) => (
        <Pressable key={pm.id} style={styles.card} onPress={() => setDefaultPayment(pm.id)}>
          <T style={styles.cardText}>{pm.label}</T>
          <T style={styles.sub}>{pm.id === defaultPaymentId ? 'Default' : pm.expMonth ? `${pm.expMonth}/${String(pm.expYear).slice(-2)}` : ''}</T>
        </Pressable>
      ))}
      <T style={styles.h}>Add a card</T>
      <TextInput style={styles.input} placeholder="Card number" placeholderTextColor={colors.muted} keyboardType="number-pad" value={number} onChangeText={setNumber} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput style={[styles.input, { flex: 1 }]} placeholder="MM/YY" placeholderTextColor={colors.muted} value={exp} onChangeText={setExp} />
        <TextInput style={[styles.input, { flex: 1 }]} placeholder="CVC" placeholderTextColor={colors.muted} keyboardType="number-pad" value={cvc} onChangeText={setCvc} />
      </View>
      {error && <T style={{ color: colors.red, marginBottom: 6 }}>{error}</T>}
      <Button label="Add card" onPress={submit} />
      <T style={[styles.sub, { marginTop: 8 }]}>Test cards: 4242 4242 4242 4242 works, 4000 0000 0000 0002 declines. No real card is ever charged.</T>
    </View>
  );
}

function GetCash() {
  const { getCashUSD } = useApp();
  return (
    <View>
      <T style={{ fontSize: 40, fontWeight: '700' }}>{formatMoney(getCashUSD, 'USD')}</T>
      <T style={styles.sub}>Simulated balance. Pick GET Cash as the payment method at checkout to spend it, or send it to a friend (coming soon).</T>
    </View>
  );
}

function Personal() {
  const { user } = useAuth();
  const { profile, updateProfile } = useApp();
  const [name, setName] = useState(profile.fullName || user?.name || '');
  const [username, setUsername] = useState(profile.username);
  const [phone, setPhone] = useState(profile.phone);
  // saved when you leave a field
  const field = (placeholder: string, value: string, set: (v: string) => void, save: () => void, extra?: object) => (
    <TextInput
      style={styles.input}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      value={value}
      onChangeText={set}
      onBlur={save}
      {...extra}
    />
  );
  return (
    <View style={{ gap: 8 }}>
      {field('Name', name, setName, () => name.trim() !== profile.fullName && updateProfile({ fullName: name.trim() }))}
      {field('Username', username, setUsername, () => username.trim() !== profile.username && updateProfile({ username: username.trim() }), { autoCapitalize: 'none' })}
      {field('Phone', phone, setPhone, () => phone.trim() !== profile.phone && updateProfile({ phone: phone.trim() }), { keyboardType: 'phone-pad' })}
      <TextInput style={[styles.input, { color: colors.muted }]} value={user?.email ?? ''} editable={false} />
      <T style={styles.sub}>Saved to your GET account.</T>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', left: 10, right: 10, backgroundColor: colors.white, borderWidth: 1, borderRadius: 10, borderColor: colors.black, overflow: 'hidden', zIndex: 15 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingLeft: 56, borderBottomWidth: 1, borderBottomColor: colors.black },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 22, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 12, color: colors.muted },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 56, paddingRight: 16, height: 54, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowText: { fontSize: 18 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, paddingLeft: 56, borderBottomWidth: 1, borderBottomColor: colors.black },
  backText: { fontSize: 18, fontWeight: '700' },
  empty: { fontSize: 15, color: colors.muted },
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: colors.black, borderRadius: 8, padding: 12, marginBottom: 8 },
  cardText: { fontSize: 16, fontWeight: '600' },
  h: { fontSize: 16, fontWeight: '700', marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.black, borderRadius: 6, height: 42, paddingHorizontal: 10, marginBottom: 8, fontFamily: fonts.sans, fontSize: 16, color: colors.ink },
});
