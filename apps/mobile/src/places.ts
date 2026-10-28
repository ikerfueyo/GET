/**
 * A small offline gazetteer for the Location Search Interface (LI 11).
 * Swap for a geocoding API (Mapbox, Google Places) once there is a key.
 */
import { STORES, type LatLng } from '@get/shared';

export interface Place extends LatLng {
  name: string;
  address: string;
}

const CITIES: Place[] = [
  ['New Haven', 'Connecticut, United States', 41.3083, -72.9279],
  ['New York', 'New York, United States', 40.7128, -74.006],
  ['Boston', 'Massachusetts, United States', 42.3601, -71.0589],
  ['San Francisco', 'California, United States', 37.7749, -122.4194],
  ['Los Angeles', 'California, United States', 34.0522, -118.2437],
  ['Miami', 'Florida, United States', 25.7617, -80.1918],
  ['Ciudad de México', 'México', 19.4326, -99.1332],
  ['Monterrey', 'Nuevo León, México', 25.6866, -100.3161],
  ['Guadalajara', 'Jalisco, México', 20.6597, -103.3496],
  ['Toronto', 'Ontario, Canada', 43.6532, -79.3832],
  ['Bogotá', 'Colombia', 4.711, -74.0721],
  ['São Paulo', 'Brasil', -23.5505, -46.6333],
  ['Buenos Aires', 'Argentina', -34.6037, -58.3816],
  ['Madrid', 'España', 40.4168, -3.7038],
  ['Barcelona', 'España', 41.3874, 2.1686],
  ['London', 'United Kingdom', 51.5072, -0.1276],
  ['Paris', 'France', 48.8566, 2.3522],
  ['Berlin', 'Germany', 52.52, 13.405],
  ['Rome', 'Italy', 41.9028, 12.4964],
  ['Dubai', 'United Arab Emirates', 25.2048, 55.2708],
  ['Mumbai', 'India', 19.076, 72.8777],
  ['Singapore', 'Singapore', 1.3521, 103.8198],
  ['Hong Kong', 'China', 22.3193, 114.1694],
  ['Shanghai', 'China', 31.2304, 121.4737],
  ['Seoul', 'South Korea', 37.5665, 126.978],
  ['Tokyo', 'Japan', 35.6762, 139.6503],
  ['Sydney', 'Australia', -33.8688, 151.2093],
  ['Cape Town', 'South Africa', -33.9249, 18.4241],
  ['Lagos', 'Nigeria', 6.5244, 3.3792],
].map(([name, address, lat, lng]) => ({ name: name as string, address: address as string, lat: lat as number, lng: lng as number }));

const STORE_PLACES: Place[] = STORES.filter((s) => s.kind === 'physical').map((s) => ({
  name: s.name,
  address: `${s.address}, ${s.city}`,
  lat: s.lat,
  lng: s.lng,
}));

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function searchPlaces(q: string, limit = 10): Place[] {
  const needle = fold(q.trim());
  const all = [...CITIES, ...STORE_PLACES];
  if (!needle) return CITIES.slice(0, limit);
  return all.filter((p) => fold(p.name).includes(needle) || fold(p.address).includes(needle)).slice(0, limit);
}
