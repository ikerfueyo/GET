/**
 * A rule-based stand-in for the AI shopping assistant (the robot button).
 * Turns a request like "barbecue for 8 people" into a bundle of searches with
 * quantities. Swap for an LLM call later; the output shape can stay the same.
 */
export interface BundleItem {
  query: string;
  quantity: number;
  why: string;
}

export interface BundlePlan {
  title: string;
  items: BundleItem[];
}

function people(text: string): number {
  const m = text.match(/(\d+)\s*(people|persons|personas|guests|pax|friends)?/i);
  return m ? Math.max(1, Math.min(200, Number(m[1]))) : 4;
}

export function planBundle(text: string): BundlePlan {
  const t = text.toLowerCase();
  const n = people(t);
  if (/(bbq|barbecue|barbeque|asada|grill)/.test(t)) {
    return {
      title: `Barbecue for ${n}`,
      items: [
        { query: 'ribeye steak', quantity: Math.ceil((n * 0.3) / 0.5), why: '≈300 g of meat per person' },
        { query: 'charcoal', quantity: Math.ceil(n / 8), why: 'one 4 kg bag per 8 people' },
        { query: 'corona beer', quantity: Math.ceil(n / 3), why: 'two drinks per person' },
        { query: 'sparkling water', quantity: Math.ceil(n / 4), why: 'for non-drinkers' },
        ...(/(no grill|need a grill|without grill)/.test(t) ? [{ query: 'kettle grill', quantity: 1, why: 'you said you need a grill' }] : []),
      ],
    };
  }
  if (/(party|birthday|cumple|fiesta)/.test(t)) {
    return {
      title: `Party for ${n}`,
      items: [
        { query: 'bacardi rum', quantity: Math.ceil(n / 8), why: 'one bottle per 8 guests' },
        { query: 'coca cola', quantity: Math.ceil(n / 2), why: 'mixer' },
        { query: 'water', quantity: Math.ceil(n / 3), why: 'hydration' },
      ],
    };
  }
  if (/(broken door|door)/.test(t)) {
    return { title: 'Fix a door', items: [{ query: 'door repair', quantity: 1, why: 'a handyman visit' }] };
  }
  if (/(leak|plumb)/.test(t)) {
    return { title: 'Fix a leak', items: [{ query: 'plumber', quantity: 1, why: 'diagnosis visit' }] };
  }
  // otherwise treat "a, b and c" or "a + b" as a list
  const parts = t
    .split(/\s*(?:\+|,|\band\b|\by\b)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { title: 'Your list', items: parts.map((q) => ({ query: q, quantity: 1, why: '' })) };
}
