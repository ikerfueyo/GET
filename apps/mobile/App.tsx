import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HomeScreen } from './src/HomeScreen';
import { LoadingScreen } from './src/LoadingScreen';
import { AppStateProvider } from './src/state/AppState';

export default function App() {
  const [loading, setLoading] = useState(true);
  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <StatusBar style={loading ? 'dark' : 'light'} />
        <HomeScreen />
        {loading && <LoadingScreen onDone={() => setLoading(false)} />}
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
