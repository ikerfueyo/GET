/**
 * Sign in / register with Supabase Auth (email + password). The session is
 * kept in AsyncStorage by the client in ../supabase.
 */
import type { User as SupabaseUser } from '@supabase/supabase-js';
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
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (name: string, email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const fromSupabase = (u: SupabaseUser): User => ({
  id: u.id,
  email: u.email ?? '',
  name: (u.user_metadata?.full_name as string | undefined) ?? u.email?.split('@')[0] ?? '',
});

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
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session ? fromSupabase(data.session.user) : null);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session ? fromSupabase(session.user) : null));
    return () => data.subscription.unsubscribe();
  }, []);

  const signIn = async (rawEmail: string, password: string): Promise<AuthResult> => {
    const email = normalizeEmail(rawEmail);
    const invalid = validate(email, password);
    if (invalid) return { error: invalid };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error?.code === 'invalid_credentials') return { error: 'Wrong email or password.' };
    return { error: error ? error.message : null };
  };

  const signUp = async (name: string, rawEmail: string, password: string): Promise<AuthResult> => {
    const email = normalizeEmail(rawEmail);
    const invalid = validate(email, password, name);
    if (invalid) return { error: invalid };
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name.trim() } } });
    if (error) return { error: error.message };
    // projects with "Confirm email" on return no session until the link is opened
    return data.session ? { error: null } : { error: null, notice: `Check ${email} to confirm your account, then sign in.` };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return <Ctx.Provider value={{ ready, user, signIn, signUp, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
