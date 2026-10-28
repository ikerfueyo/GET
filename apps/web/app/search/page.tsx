import { DEFAULT_LOCATIONS, MODES, formatEta, formatMoney, search, type SortKey } from '@get/shared';
import { Badges } from '../badges';

type Props = { searchParams: Promise<{ q?: string; loc?: string; sort?: SortKey }> };

export default async function Search({ searchParams }: Props) {
  const { q = '', loc = 'loc_here', sort = 'best' } = await searchParams;
  const location = DEFAULT_LOCATIONS.find((l) => l.id === loc) ?? DEFAULT_LOCATIONS[0];
  const results = q ? search({ query: q, location, sort }) : [];
  return (
    <>
      <h1>Search</h1>
      <p className="sub">The same optimal-offer engine the app uses: price + fees + time until you have it.</p>
      <form className="filters">
        <input name="q" defaultValue={q} placeholder="Search GET" className="search" autoFocus />
        <select name="loc" defaultValue={location.id}>
          {DEFAULT_LOCATIONS.map((l) => <option key={l.id} value={l.id}>{l.label} · {l.address}</option>)}
        </select>
        <select name="sort" defaultValue={sort}>
          {['best', 'price', 'eta', 'rating', 'distance'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <button type="submit">Search</button>
      </form>
      {q && results.length === 0 && <p className="note">Nothing matches “{q}” yet.</p>}
      {results.map((r) => (
        <div className="card" key={r.product.id}>
          <div className="row">
            <div className="glyph">{r.product.glyph}</div>
            <div className="grow">
              <b>{r.product.name}</b> <span className="sub">· {r.product.brand}</span>
              <div><span className="pill">{r.best.storeName}</span> ★ {r.best.rating.toFixed(1)}</div>
            </div>
            <div className="price">{formatMoney(r.best.total, r.best.currency)}</div>
            <div style={{ textAlign: 'center' }}>
              <Badges available={MODES.filter((m) => r.modes[m])} chosen={r.best.mode} />
              <div>{formatEta(r.best.etaMinutes)}</div>
            </div>
          </div>
          <table style={{ marginTop: 10 }}>
            <tbody>
              {r.options.slice(0, 5).map((o) => (
                <tr key={o.offerId + o.mode}>
                  <td>{o.storeName}</td>
                  <td>{o.mode.replace('_', '-')}</td>
                  <td>{formatEta(o.etaMinutes)}</td>
                  <td>{o.storeKind === 'online' ? 'ships' : `${o.distanceKm} km`}</td>
                  <td className="num">{formatMoney(o.total, o.currency)}</td>
                  <td className="num sub">score {o.score.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
