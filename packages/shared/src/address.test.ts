import { describe, expect, it } from 'vitest';
import { formatAddress, missingParts, parseAddress } from './address';

describe('address parts', () => {
  it('reads a US street address back into its parts', () => {
    const p = parseAddress('120 Howe St, New Haven, CT 06511, United States');
    expect(p).toMatchObject({ street: '120 Howe St', city: 'New Haven', region: 'CT', postcode: '06511', country: 'United States' });
    expect(formatAddress(p)).toBe('120 Howe St, New Haven, CT 06511, United States');
    expect(missingParts(p)).toEqual([]);
  });

  it('treats a place without a region/postcode line as broader than a street', () => {
    const p = parseAddress('Polanco, Ciudad de México, Mexico');
    expect(p).toMatchObject({ street: '', neighborhood: 'Polanco', city: 'Ciudad de México', country: 'Mexico' });
    expect(missingParts(p)).toEqual([]);
  });

  it('needs city, state/province, postcode and country once there is a street', () => {
    expect(missingParts({ street: '1 Main St', neighborhood: '', city: '', region: 'CT', postcode: '', country: 'United States' })).toEqual(['city', 'postcode']);
    expect(missingParts({ street: '', neighborhood: '', city: 'Paris', region: '', postcode: '', country: '' })).toEqual(['country']);
  });
});
