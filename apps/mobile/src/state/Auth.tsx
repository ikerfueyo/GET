/**
 * Sign in / register. Uses Supabase Auth when EXPO_PUBLIC_SUPABASE_URL and
 * EXPO_PUBLIC_SUPABASE_ANON_KEY are set; otherwise accounts live on the device
 * (AsyncStorage, salted SHA-256 passwords) so the demo works without a backend.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../supabase';

export interface User {
  id: string;
  email: string;
  name: string;
}

/** null on success, otherwise a message for the form; `notice` when sign-up needs an email confirmation */
export type AuthResult = { error: string | null; notice?: string };

interface Auth {
  ready: boolean;
  user: User | null;
  backend: 'supabase' | 'device';
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (name: string, email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const fromSupabase = (u: SupabaseUser): User => ({
  id: u.id,
  email: u.email ?? '',
  name: (u.user_metadata?.full_name as string | undefined) ?? u.email?.split('@')[0] ?? '',
});

// ───────────── device accounts ─────────────

const USERS_KEY = 'get.auth.users';
const SESSION_KEY = 'get.auth.session';

interface DeviceAccount extends User {
  salt: string;
  hash: string;
}

const hashPassword = (salt: string, password: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${password}`);

async function readAccounts(): Promise<Record<string, DeviceAccount>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(USERS_KEY)) ?? '{}');
  } catch {
    return {};
  }
}

const publicUser = ({ id, email, name }: DeviceAccount): User => ({ id, email, name });

// ───────────── validation shared by both backends ─────────────

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

function validate(email: string, password: string, name?: string): string | null {
  if (name !== undefined && !name.trim()) return 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email.';
  if (password.length < 6) return 'Password needs at least 6 characters.';
  return null;
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        setUser(data.session ? fromSupabase(data.session.user) : null);
        setReady(true);
      });
      const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session ? fromSupabase(session.user) : null));
      return () => data.subscription.unsubscribe();
    }
    (async () => {
      const email = await AsyncStorage.getItem(SESSION_KEY).catch(() => null);
      const account = email ? (await readAccounts())[email] : undefined;
      setUser(account ? publicUser(account) : null);
      setReady(true);
    })();
  }, []);

  const signIn = async (rawEmail: string, password: string): Promise<AuthResult> => {
    const email = normalizeEmail(rawEmail);
    const invalid = validate(email, password);
    if (invalid) return { error: invalid };
    if (supabase) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error?.code === 'invalid_credentials') return { error: 'Wrong email or password.' };
      return { error: error ? error.message : null };
    }
    const account = (await readAccounts())[email];
    if (!account || (await hashPassword(account.salt, password)) !== account.hash) return { error: 'Wrong email or password.' };
    await AsyncStorage.setItem(SESSION_KEY, email);
    setUser(publicUser(account));
    return { error: null };
  };

  const signUp = async (name: string, rawEmail: string, password: string): Promise<AuthResult> => {
    const email = normalizeEmail(rawEmail);
    const invalid = validate(email, password, name);
    if (invalid) return { error: invalid };
    if (supabase) {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name.trim() } } });
      if (error) return { error: error.message };
      // projects with "Confirm email" on return no session until the link is opened
      return data.session ? { error: null } : { error: null, notice: `Check ${email} to confirm your account, then sign in.` };
    }
    const accounts = await readAccounts();
    if (accounts[email]) return { error: 'An account with this email already exists. Sign in instead.' };
    const salt = Crypto.randomUUID();
    const account: DeviceAccount = { id: Crypto.randomUUID(), email, name: name.trim(), salt, hash: await hashPassword(salt, password) };
    await AsyncStorage.setItem(USERS_KEY, JSON.stringify({ ...accounts, [email]: account }));
    await AsyncStorage.setItem(SESSION_KEY, email);
    setUser(publicUser(account));
    return { error: null };
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    else await AsyncStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  return <Ctx.Provider value={{ ready, user, backend: supabase ? 'supabase' : 'device', signIn, signUp, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
