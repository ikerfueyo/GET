import { formatMoney, type Order } from '@get/shared';

export const dynamic = 'force-dynamic';

async function loadOrders(): Promise<Order[] | null> {
  const url = process.env.API_URL ?? 'http://localhost:4000';
  try {
    const res = await fetch(`${url}/orders`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as Order[]) : null;
  } catch {
    return null;
  }
}

export default async function Orders() {
  const orders = await loadOrders();
  return (
    <>
      <h1>Orders</h1>
      <p className="sub">Simulated orders placed through the API.</p>
      {orders === null ? (
        <p className="note">The API is not reachable. Start it with <code>npm run api</code> (or set <code>API_URL</code>).</p>
      ) : orders.length === 0 ? (
        <p className="note">No orders yet. Place one from the app with the GET button.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Placed</th><th>Store</th><th>Mode</th><th>Items</th><th>Paid with</th><th className="num">Total</th></tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{new Date(o.placedAt).toLocaleString()}</td>
                <td>{o.storeName}</td>
                <td>{o.mode.replace('_', '-')}</td>
                <td>{o.lines.map((l) => `${l.quantity}× ${l.name}`).join(', ')}</td>
                <td>{o.paymentLabel}</td>
                <td className="num">{formatMoney(o.total, o.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
