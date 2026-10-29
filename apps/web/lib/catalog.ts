/**
 * The operator pages read the catalogue from Supabase, like the apps. It is
 * fetched once per server process and refreshed at most once a minute.
 */
import { createClient } from '@supabase/supabase-js';
import { fetchCatalog } from '@get/shared';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

let loaded: { at: number; done: Promise<unknown> } | null = null;

/** fills STORES / PRODUCTS / OFFERS from @get/shared; throws if Supabase can't be read */
export async function ensureCatalog() {
  if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in apps/web/.env.local.');
  if (!loaded || Date.now() - loaded.at > 60_000) {
    const done = fetchCatalog(createClient(url, key, { auth: { persistSession: false } }));
    loaded = { at: Date.now(), done };
    done.catch(() => (loaded = null)); // try again on the next request
  }
  await loaded.done;
}
