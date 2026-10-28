import { Platform } from 'react-native';

/** Palette taken from the sketches: black, white, greys, and one accent per open interface. */
export const colors = {
  black: '#000000',
  white: '#FFFFFF',
  ink: '#111111',
  panel: '#9E9E9E', // Orders Interface background
  field: '#E3E3E3', // "Search GET" field
  line: '#1A1A1A',
  hairline: '#D0D0D0',
  muted: '#7A7A7A',
  red: '#E53935', // selected location, open Location interface
  green: '#007514', // open Orders interface (cart icon in Orders Interface 2.png)
  blue: '#008EFA', // open Account interface (Expo Go's settings button blue)
  shadeOff: '#ECECEC', // S/P/D mode not offered
  ocean: '#2D5BC4',
  land: '#2E7D4F',
  landStroke: '#256A42',
  moon: '#F2F2F2',
  mars: '#E5533D',
};

export const fonts = {
  // Notes ask for Calibri; it ships on few phones, so fall back to the system sans.
  sans: Platform.select({ web: 'Calibri, Carlito, "Helvetica Neue", Arial, sans-serif', default: undefined }),
  // The sketches draw "Search GET" in a typewriter face.
  mono: Platform.select({ ios: 'Courier', android: 'monospace', default: '"Courier New", Courier, monospace' }),
};

export const radius = { sm: 4, md: 8, lg: 14 };
