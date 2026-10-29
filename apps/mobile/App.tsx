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

function Root() {
  const { ready, user } = useAuth();
  const [loading, setLoading] = useState(true);
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

  const failed = !loading && catalog === 'error';
  const showLogin = !loading && ready && catalog === 'ok' && !user;
  return (
    <>
      <StatusBar style={loading || showLogin || failed ? 'dark' : 'light'} />
      {/* keyed by user so carts, orders and wallet start fresh for each account */}
      {user && catalog === 'ok' && (
        <AppStateProvider key={user.id}>
          <HomeScreen />
        </AppStateProvider>
      )}
      {showLogin && <LoginScreen />}
      {failed && <ConnectError onRetry={loadCatalog} />}
      {(loading || !ready || catalog === 'loading') && <LoadingScreen onDone={() => setLoading(false)} />}
    </>
  );
}
