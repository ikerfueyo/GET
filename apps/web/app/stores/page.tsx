import { OFFERS, STORES } from '@get/shared';

export default function Stores() {
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
              <td>{s.address}, {s.city}, {s.country}</td>
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
