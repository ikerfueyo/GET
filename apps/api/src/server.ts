import { createClient } from '@supabase/supabase-js';
import { fetchCatalog } from '@get/shared';
import { createApp } from './app';

const port = Number(process.env.PORT ?? 4000);
const url = process.env.SUPABASE_URL;
// the catalogue is public, so the publishable key is enough; the service role key also works
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY (see .env.example): the catalogue lives in Supabase.');
  process.exit(1);
}

const catalog = await fetchCatalog(createClient(url, key, { auth: { persistSession: false } }));
console.log(`Catalogue: ${catalog.stores.length} stores, ${catalog.products.length} products, ${catalog.offers.length} offers`);
createApp().listen(port, () => {
  console.log(`GET API listening on http://localhost:${port}`);
});
