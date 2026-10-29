import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HomeScreen } from './src/HomeScreen';
import { ConnectError } from './src/ConnectError';
import { LoadingScreen } from './src/LoadingScreen';
import { LoginScreen } from './src/LoginScreen';
import { AppStateProvider } from './src/state/AppState';
import { AuthProvider, useAuth } from './src/state/Auth';
import { catalogReady } from './src/state/remote';

// the native launch screen (white, logo at the same size and spot) stays up until
// LoadingScreen has drawn, then hands over with no fade, so the logo never moves
SplashScreen.preventAutoHideAsync();

// the catalogue loads from Supabase while the loading screen plays
catalogReady();

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

/**
 * Launch: the logo waits on white until the session and catalogue are known.
 * Signed in, the page darkens into the Home Screen. Otherwise the logo slides
 * up into the sign-in page, which darkens into the Home Screen once signed in.
 */
type Stage = 'splash' | 'darken' | 'login' | 'home';

function Root() {
  const { ready, user } = useAuth();
  const [stage, setStage] = useState<Stage>('splash');
  const [held, setHeld] = useState(false);
  const [loginIntro, setLoginIntro] = useState(true);
  const [catalog, setCatalog] = useState<'loading' | 'ok' | 'error'>('loading');
  const loadCatalog = () => {
    setCatalog('loading');
    catalogReady().then(
      () => setCatalog('ok'),
      (e) => {
        console.warn('Could not load the catalogue', e);
        setCatalog('error');
      },
    );
  };
  useEffect(loadCatalog, []);
  // keep the logo on screen for a moment even when everything is already loaded
  useEffect(() => {
    const t = setTimeout(() => setHeld(true), 700);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (stage === 'splash' && held && ready && catalog === 'ok') setStage(user ? 'darken' : 'login');
    // signing out returns to the sign-in page, without the logo slide
    if (stage === 'home' && !user) {
      setLoginIntro(false);
      setStage('login');
    }
  }, [stage, held, ready, catalog, user]);

  const failed = catalog === 'error' && stage !== 'home';
  return (
    <>
      <StatusBar style={stage === 'home' ? 'light' : 'dark'} />
      {/* keyed by user so carts, orders and wallet start fresh for each account; mounted under the darkening page so it is ready when revealed */}
      {user && catalog === 'ok' && (
        <AppStateProvider key={user.id}>
          <HomeScreen revealed={stage === 'home'} />
        </AppStateProvider>
      )}
      {stage === 'login' && <LoginScreen intro={loginIntro} leaving={!!user} onLeft={() => setStage('home')} />}
      {failed && <ConnectError onRetry={loadCatalog} />}
      {(stage === 'splash' || stage === 'darken') && !failed && <LoadingScreen dark={stage === 'darken'} onDone={() => setStage('home')} onLayout={() => SplashScreen.hide()} />}
    </>
  );
}
