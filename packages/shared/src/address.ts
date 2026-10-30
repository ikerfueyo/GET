import type { Store } from './types';

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  MX: 'Mexico',
  ES: 'Spain',
  GB: 'United Kingdom',
  JP: 'Japan',
  CN: 'China',
};

export const countryName = (code: string) => COUNTRY_NAMES[code] ?? code;

/** a store's full address, ending with its country like every address in the app */
export const storeAddress = (s: Pick<Store, 'address' | 'city' | 'country'>) =>
  s.address === 'Online' ? `Online, ${countryName(s.country)}` : `${s.address}, ${s.city}, ${countryName(s.country)}`;

/**
 * An address broken into lines as on an envelope: street, then the
 * city/region/postcode, then the country (LI 3 / LI 4 / LI 9 sketches).
 */
export function addressLines(address: string): string[] {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) return parts;
  return [parts[0], parts.slice(1, -1).join(', '), parts[parts.length - 1]];
}

/**
 * An address in its parts, for editing. An exact place (a house or a street)
 * has all six; an area (a neighborhood or district, city, state/province or
 * country) has no street or postcode.
 */
export interface AddressParts {
  street: string;
  neighborhood: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
}

/** a single spot on the map, or an area with an outline */
export type PlaceKind = 'point' | 'area';

export const EMPTY_ADDRESS: AddressParts = { street: '', neighborhood: '', city: '', region: '', postcode: '', country: '' };

export const POINT_PARTS: (keyof AddressParts)[] = ['street', 'neighborhood', 'city', 'region', 'postcode', 'country'];
/** an area's parts, narrowest first */
export const AREA_PARTS: (keyof AddressParts)[] = ['neighborhood', 'city', 'region', 'country'];

/**
 * The boxes still to fill. An exact place needs every one but the neighborhood;
 * an area needs every box broader than its first filled one (a city needs its state/province and
 * country, but no neighborhood), and at least a country.
 */
export function missingParts(a: AddressParts, kind: PlaceKind = 'point'): (keyof AddressParts)[] {
  const empty = (k: keyof AddressParts) => !a[k].trim();
  // the neighborhood or district is never required
  if (kind === 'point') return POINT_PARTS.filter((k) => k !== 'neighborhood' && empty(k));
  const first = AREA_PARTS.findIndex((k) => !empty(k));
  return (first < 0 ? ['country' as const] : AREA_PARTS.slice(first + 1)).filter(empty);
}

export function formatAddress(a: AddressParts): string {
  const regionLine = [a.region.trim(), a.postcode.trim()].filter(Boolean).join(' ');
  return [a.street, a.neighborhood, a.city, regionLine, a.country].map((p) => p.trim()).filter(Boolean).join(', ');
}

/** "CT 06511", "06511" or "CT": a region and/or a postcode (postcodes carry a digit) */
function splitRegion(s: string): { region: string; postcode: string } | null {
  const m = s.match(/^(.*?)\s*([A-Z]?\d[\dA-Z -]{2,9})$/);
  if (m) return { region: m[1].trim(), postcode: m[2].trim() };
  if (/^[A-Z]{2,3}$/.test(s)) return { region: s, postcode: '' };
  return null;
}

/** Best reading of a saved one-line address back into its parts. */
export function parseAddress(address: string): AddressParts {
  const p = address.split(',').map((x) => x.trim()).filter(Boolean);
  const out = { ...EMPTY_ADDRESS };
  if (!p.length) return out;
  out.country = p.pop()!;
  if (!p.length) return out;
  const rz = splitRegion(p[p.length - 1]);
  if (rz) {
    p.pop();
    out.region = rz.region;
    out.postcode = rz.postcode;
  }
  if (!p.length) return out;
  out.city = p.pop()!;
  if (!p.length) return out;
  if (rz && p.length >= 1) {
    // street first, anything between it and the city is the neighborhood
    out.street = p.shift()!;
    out.neighborhood = p.join(', ');
  } else {
    // no region/postcode line: a broader place, e.g. "Polanco, Ciudad de México, Mexico"
    out.neighborhood = p.join(', ');
  }
  return out;
}
