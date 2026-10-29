import { OFFERS, STORES, storeAddress } from '@get/shared';
import { ensureCatalog } from '../../lib/catalog';

// read from Supabase on each request, never at build time
export const dynamic = 'force-dynamic';

export default async function Stores() {
  await ensureCatalog();
  return (
    <>
      <h1>Stores</h1>
      <p className="sub">Simulated businesses. ✓ marks brand authenticity verification.</p>
      <table>
        <thead>
          <tr>
            <th>Store</th><th>Type</th><th>Address</th><th>Currency</th><th className="num">Rating</th><th>Pickup</th><th>Delivery</th><th className="num">Offers</th>
          </tr>
        </thead>
        <tbody>
          {STORES.map((s) => (
            <tr key={s.id}>
              <td>{s.name}{s.verified ? <span className="ok"> ✓</span> : null}</td>
              <td>{s.kind === 'online' ? 'Online' : s.category}</td>
              <td>{storeAddress(s)}</td>
              <td>{s.currency}</td>
              <td className="num">{s.rating.toFixed(1)}</td>
              <td>{s.hasPickup ? 'Yes' : '—'}</td>
              <td>{s.hasDelivery ? (s.kind === 'online' || s.shipsInternational ? 'Ships worldwide' : `${s.deliveryRadiusKm} km`) : '—'}</td>
              <td className="num">{OFFERS.filter((o) => o.storeId === s.id).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
