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
 * An address in its parts, for editing. A full address has a street, city,
 * state/province, postcode and country; a broader place (a neighborhood,
 * district, city, state or country) leaves the street empty and needs only
 * its country.
 */
export interface AddressParts {
  street: string;
  neighborhood: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
}

export const EMPTY_ADDRESS: AddressParts = { street: '', neighborhood: '', city: '', region: '', postcode: '', country: '' };

/** the parts a full (street) address must have */
export function missingParts(a: AddressParts): (keyof AddressParts)[] {
  const t = (k: keyof AddressParts) => !a[k].trim();
  const required: (keyof AddressParts)[] = a.street.trim() ? ['city', 'region', 'postcode', 'country'] : ['country'];
  return required.filter(t);
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
