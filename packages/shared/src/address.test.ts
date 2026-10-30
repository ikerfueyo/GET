import { describe, expect, it } from 'vitest';
import { formatAddress, missingParts, parseAddress } from './address';

describe('address parts', () => {
  it('reads a US street address back into its parts', () => {
    const p = parseAddress('120 Howe St, Downtown, New Haven, CT 06511, United States');
    expect(p).toMatchObject({ street: '120 Howe St', neighborhood: 'Downtown', city: 'New Haven', region: 'CT', postcode: '06511', country: 'United States' });
    expect(formatAddress(p)).toBe('120 Howe St, Downtown, New Haven, CT 06511, United States');
    expect(missingParts(p)).toEqual([]);
  });

  it('reads a place without a region/postcode line as an area', () => {
    const p = parseAddress('Polanco, Ciudad de México, Mexico');
    expect(p).toMatchObject({ street: '', neighborhood: 'Polanco', city: 'Ciudad de México', country: 'Mexico' });
  });

  it('needs every box for an exact place', () => {
    expect(missingParts({ street: '1 Main St', neighborhood: '', city: '', region: 'CT', postcode: '', country: 'United States' })).toEqual([
      'neighborhood',
      'city',
      'postcode',
    ]);
  });

  it('needs the boxes broader than the first filled one for an area', () => {
    const area = { street: '', neighborhood: '', city: 'Paris', region: '', postcode: '', country: '' };
    expect(missingParts(area, 'area')).toEqual(['region', 'country']);
    expect(missingParts({ ...area, city: '', country: 'France' }, 'area')).toEqual([]);
    expect(missingParts({ ...area, city: '' }, 'area')).toEqual(['country']);
  });
});
