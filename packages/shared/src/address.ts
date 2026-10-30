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
