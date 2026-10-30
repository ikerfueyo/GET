/**
 * A small offline gazetteer for the Location Search Interface (LI 11).
 * Swap for a geocoding API (Mapbox, Google Places) once there is a key.
 */
import { STORES, formatAddress, parseAddress, storeAddress, type AddressParts, type LatLng } from '@get/shared';

export interface Place extends LatLng {
  name: string;
  address: string;
  /** the address in its parts, when the geocoder gave them */
  parts?: AddressParts;
}

export const partsOf = (p: Pick<Place, 'address' | 'parts'>) => p.parts ?? parseAddress(p.address);

const CITIES: Place[] = [
  ['New Haven', 'CT, United States', 41.3083, -72.9279],
  ['New York', 'NY, United States', 40.7128, -74.006],
  ['Boston', 'MA, United States', 42.3601, -71.0589],
  ['San Francisco', 'CA, United States', 37.7749, -122.4194],
  ['Los Angeles', 'CA, United States', 34.0522, -118.2437],
  ['Miami', 'FL, United States', 25.7617, -80.1918],
  ['Ciudad de México', 'Mexico', 19.4326, -99.1332],
  ['Monterrey', 'Nuevo León, Mexico', 25.6866, -100.3161],
  ['Guadalajara', 'Jalisco, Mexico', 20.6597, -103.3496],
  ['Toronto', 'ON, Canada', 43.6532, -79.3832],
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

/** US states and Canadian provinces go by their postal initials in addresses (CT, not Connecticut) */
const REGION_CODES: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT',
  Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL',
  Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT',
  Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA',
  'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT',
  Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
  'Puerto Rico': 'PR',
  Alberta: 'AB', 'British Columbia': 'BC', Manitoba: 'MB', 'New Brunswick': 'NB', 'Newfoundland and Labrador': 'NL',
  'Nova Scotia': 'NS', Ontario: 'ON', 'Prince Edward Island': 'PE', Quebec: 'QC', Saskatchewan: 'SK',
  'Northwest Territories': 'NT', Nunavut: 'NU', Yukon: 'YT',
};
export const regionCode = (state: string | undefined, country: string | undefined) =>
  state && (country === 'United States' || country === 'Canada') ? (REGION_CODES[state] ?? state) : state;

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    district?: string;
    locality?: string;
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
function toPlace({ geometry, properties: p }: PhotonFeature): Place | null {
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const parts: AddressParts = {
    street,
    neighborhood: p.locality ?? p.district ?? '',
    city: p.city ?? '',
    region: regionCode(p.state, p.country) ?? '',
    postcode: p.postcode ?? '',
    country: p.country ?? '',
  };
  const name = p.name || street || p.city;
  if (!name) return null;
  const address = formatAddress(parts);
  return { name, address: address || name, parts, lat: geometry.coordinates[1], lng: geometry.coordinates[0] };
}

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
  return features.flatMap((f) => {
    const place = toPlace(f);
    if (!place || seen.has(place.name + place.address)) return [];
    seen.add(place.name + place.address);
    return [place];
  });
}

/** The address at a point, for a pin that was dragged somewhere new. */
export async function reverseGeocode(p: LatLng, signal?: AbortSignal): Promise<Place | null> {
  const params = new URLSearchParams({ lat: p.lat.toFixed(6), lon: p.lng.toFixed(6), lang: 'en', limit: '1' });
  const res = await fetch(`https://photon.komoot.io/reverse?${params}`, { signal });
  if (!res.ok) throw new Error(`geocoder ${res.status}`);
  const { features } = (await res.json()) as { features: PhotonFeature[] };
  return features[0] ? toPlace(features[0]) : null;
}

/** the list's second line: the address without the part already in the name */
export const placeSubtitle = (p: Place) => (p.address.startsWith(`${p.name}, `) ? p.address.slice(p.name.length + 2) : p.address);
