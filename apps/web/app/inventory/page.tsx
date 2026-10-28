import { OFFERS, STORES, formatMoney, productById, storeById } from '@get/shared';
import { Badges } from '../badges';

type Props = { searchParams: Promise<{ city?: string; category?: string; q?: string }> };

export default async function Inventory({ searchParams }: Props) {
  const { city = '', category = '', q = '' } = await searchParams;
  const cities = [...new Set(STORES.map((s) => s.city))].sort();
  const categories = [...new Set(OFFERS.map((o) => productById.get(o.productId)!.category))].sort();
  const needle = q.toLowerCase();
  const rows = OFFERS.map((o) => ({ o, s: storeById.get(o.storeId)!, p: productById.get(o.productId)! })).filter(
    ({ s, p }) =>
      (!city || s.city === city) &&
      (!category || p.category === category) &&
      (!needle || p.name.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle)),
  );
  return (
    <>
      <h1>Inventory</h1>
      <p className="sub">Every offer: one product at one store, with price, stock and how it can be gotten.</p>
      <form className="filters">
        <input name="q" defaultValue={q} placeholder="Product or store" className="search" />
        <select name="city" defaultValue={city}>
          <option value="">All cities</option>
          {cities.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select name="category" defaultValue={category}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button type="submit">Filter</button>
        <span className="sub" style={{ margin: 0 }}>{rows.length} offers</span>
      </form>
      <table>
        <thead>
          <tr>
            <th>Product</th><th>Store</th><th>City</th><th>Modes</th><th className="num">Price</th><th className="num">Delivery fee</th><th className="num">Stock</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ o, s, p }) => (
            <tr key={o.id}>
              <td>{p.glyph} {p.name}</td>
              <td>{s.name}{s.verified ? <span className="ok"> ✓</span> : null}</td>
              <td>{s.city}</td>
              <td><Badges available={o.modes} /></td>
              <td className="num">{formatMoney(o.price, s.currency)}</td>
              <td className="num">{o.deliveryFee ? formatMoney(o.deliveryFee, s.currency) : '—'}</td>
              <td className="num">{o.stock}{o.inventoryVerified ? <span className="ok"> ✓</span> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
