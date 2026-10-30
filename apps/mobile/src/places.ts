/**
 * A small offline gazetteer for the Location Search Interface (LI 11).
 * Swap for a geocoding API (Mapbox, Google Places) once there is a key.
 */
import { STORES, storeAddress, type LatLng } from '@get/shared';

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
  ['Ciudad de México', 'Mexico', 19.4326, -99.1332],
  ['Monterrey', 'Nuevo León, Mexico', 25.6866, -100.3161],
  ['Guadalajara', 'Jalisco, Mexico', 20.6597, -103.3496],
  ['Toronto', 'Ontario, Canada', 43.6532, -79.3832],
  ['Bogotá', 'Colombia', 4.711, -74.0721],
  ['São Paulo', 'Brazil', -23.5505, -46.6333],
  ['Buenos Aires', 'Argentina', -34.6037, -58.3816],
  ['Madrid', 'Spain', 40.4168, -3.7038],
  ['Barcelona', 'Spain', 41.3874, 2.1686],
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

// a function so stores loaded from Supabase after startup are searchable too
const storePlaces = (): Place[] =>
  STORES.filter((s) => s.kind === 'physical').map((s) => ({
    name: s.name,
    address: storeAddress(s),
    lat: s.lat,
    lng: s.lng,
  }));

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function searchPlaces(q: string, limit = 10): Place[] {
  const needle = fold(q.trim());
  const all = [...CITIES, ...storePlaces()];
  if (!needle) return CITIES.slice(0, limit);
  return all.filter((p) => fold(p.name).includes(needle) || fold(p.address).includes(needle)).slice(0, limit);
}

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    district?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
};

/**
 * Worldwide search as you type: Photon (komoot), an open geocoder over
 * OpenStreetMap that needs no key. Results near `near` rank first. Addresses
 * end with the country, like every address in the app.
 */
export async function geocode(q: string, near?: LatLng, signal?: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({ q, limit: '10', lang: 'en' });
  if (near) {
    params.set('lat', near.lat.toFixed(4));
    params.set('lon', near.lng.toFixed(4));
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal });
  if (!res.ok) throw new Error(`geocoder ${res.status}`);
  const { features } = (await res.json()) as { features: PhotonFeature[] };
  const seen = new Set<string>();
  return features.flatMap(({ geometry, properties: p }) => {
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    const name = p.name || street || p.city;
    if (!name) return [];
    const region = [p.state, p.postcode].filter(Boolean).join(' ');
    const address = [street, p.city ?? p.district, region, p.country].filter(Boolean).join(', ');
    const key = name + address;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ name, address: address || name, lat: geometry.coordinates[1], lng: geometry.coordinates[0] }];
  });
}

/** the list's second line: the address without the part already in the name */
export const placeSubtitle = (p: Place) => (p.address.startsWith(`${p.name}, `) ? p.address.slice(p.name.length + 2) : p.address);
