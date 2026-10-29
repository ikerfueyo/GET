import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HomeScreen } from './src/HomeScreen';
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
  const showLogin = !loading && ready && !user;
  return (
    <>
      <StatusBar style={loading || showLogin ? 'dark' : 'light'} />
      {/* keyed by user so carts, orders and wallet start fresh for each account */}
      {user && (
        <AppStateProvider key={user.id}>
          <HomeScreen />
        </AppStateProvider>
      )}
      {showLogin && <LoginScreen />}
      {(loading || !ready) && <LoadingScreen onDone={() => setLoading(false)} />}
    </>
  );
}
