# GET

Anything, anywhere, in one click. GET finds the best way to get any product or service (in-store, pickup or delivery, from any store in the world) and lets you get it in one tap.

No business is connected yet. Stores, prices and stock are simulated, and every payment is fake.

## What's in the repo

```
apps/
  mobile/   Expo (React Native, TypeScript): the GET app
  web/      Next.js: the operator side (inventory, stores, orders, search playground)
  api/      Node (Express): search, wallet and simulated checkout
packages/
  shared/   Types, catalogue loading, the optimal-offer engine, fake checkout (scripts/: the simulated inventory generator)
supabase/
  migrations/  Postgres schema with row level security
  seed.sql     Generated from packages/shared (npm run db:seed-sql)
```

The mobile app, the web app and the API all import `@get/shared`, so the ranking is the same everywhere, and they all read the catalogue from Supabase.

## Run it

Requires Node 20+.

```bash
npm install

npm run mobile      # Expo dev server: scan the QR with Expo Go, or press w for web
npm run api         # http://localhost:4000
npm run web         # http://localhost:3000
npm test            # engine + API tests
```

The catalogue (stores, products, offers) lives only in Supabase. The mobile app, the web pages and the API all read it from there through `fetchCatalog()` in `@get/shared`; if the app can't reach Supabase it shows "Can't connect to GET" with a Try again button. `packages/shared/scripts/generate-catalog.ts` is the simulated inventory that `npm run db:seed-sql` turns into `supabase/seed.sql`, and the tests run on it so they need no database.

### Supabase

GET uses the project at `https://kbznyfvpkucqlzznmonb.supabase.co`. Its URL and publishable key are the app's defaults (`apps/mobile/src/supabase.ts`); set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to use another project.

To set up a new project:

1. Create it at supabase.com. In the SQL editor run `supabase/migrations/20261028000000_init.sql`, then `supabase/seed.sql` (or `npx supabase link` + `npx supabase db push` and `psql "$DATABASE_URL" -f supabase/seed.sql`).
2. For quick demos, turn off Authentication → Sign In / Providers → Email → "Confirm email".
3. Web: copy `apps/web/.env.example` to `apps/web/.env.local` and fill in the URL and publishable key.
4. API: copy `apps/api/.env.example` to `apps/api/.env` and fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Optionally add `SUPABASE_SERVICE_ROLE_KEY` and a `DEMO_USER_ID` to persist API orders.

Register and Sign in use Supabase Auth (email + password). Each account's GET Cash, wallet cards, saved locations, carts, orders and personal info are kept in its tables under row level security (`apps/mobile/src/state/remote.ts`). A new account starts with the demo cards, $150 of GET Cash and Home / Work / CDMX. Log out in Account returns to the Login screen.

## Fake payments

Any Luhn-valid card number works. `4242 4242 4242 4242` succeeds, `4000 0000 0000 0002` is declined. Every account starts with $150 of GET Cash. No card number is ever stored, only brand and last 4.

## How "optimal" is decided

Ranking follows the project's ranking design v1. Every way of getting every matching product is an option (store × in-store/pickup/delivery). After hard filters, options are ordered by real cost:

```
real cost = what you pay
          + your time  (round-trip travel hours × value of time)
          + waiting    (days until you have it × patience)
          + risk       (price × 2% unverified stock, 3% cross-border, 10% per star under 4.0)
```

Presets: Cheapest ($0/h, $0/day), Balanced ($20/h, $3/day, the default) and Soonest ($60/h, $30/day). The list shows the price you pay; real cost only decides the order. You can also sort by price, ETA, rating or distance and filter by in-store, pickup, delivery or Urgent. The logic is `packages/shared/src/engine.ts`.

## Home screen (from the sketches)

- Loading: white fades to black around the GET mark.
- Login/Register (LRI 1, blank in the sketches): white page, GET mark, Sign in / Register toggle, email + password (and name to register). Shown until you are signed in; each account gets its own carts, orders and wallet.
- The globe is always the background: drag to rotate, pinch (or scroll on web) to zoom, tap anywhere to pick a location, tap the pin to zoom into it. The Moon and Mars sit where they really are right now.
- The floating bar on the left opens Location, Orders and Account. Drag it anywhere; it fades when idle.
- Search lives at the bottom. Drag it up or tap it to expand. The robot button turns it into the assistant ("barbecue for 8 people"); `a + b + c` searches a bundle.
- Each result shows the S/P/D strip in grey shades (dark = offered in-store / pickup / delivery, light = not offered) and ETA. Tap a result for every option, then GET (buy now) or + (add to that store's cart).

## Next steps

- Street-level map when zoomed in (HS 2), via react-native-maps or Mapbox.
- Favorites and booking reservations have no UI yet. The web Orders page still lists the API's orders, not each user's orders in Supabase.
- Group carts: invite, split by fraction or items, discounts (Orders Interface specs).
- Location add/edit forms (building type, details, label) and sharing.
- Swap the rule-based assistant for an LLM.
