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
  shared/   Types, simulated world inventory, the optimal-offer engine, fake checkout
supabase/
  migrations/  Postgres schema with row level security
  seed.sql     Generated from packages/shared (npm run db:seed-sql)
```

The mobile app, the web app and the API all import `@get/shared`, so the catalogue and the ranking are the same everywhere.

## Run it

Requires Node 20+.

```bash
npm install

npm run mobile      # Expo dev server: scan the QR with Expo Go, or press w for web
npm run api         # http://localhost:4000
npm run web         # http://localhost:3000
npm test            # engine + API tests
```

The mobile app works on its own: search and checkout run on the device. To send checkouts through the API (so they show up on the web Orders page), start the API and run the app with `EXPO_PUBLIC_API_URL=http://<your-computer's-LAN-IP>:4000 npm run mobile`.

### Supabase

1. Create a project at supabase.com, then in this folder: `npx supabase init` (keep the existing `supabase/` files), `npx supabase link`, `npx supabase db push`.
2. Load the catalogue: paste `supabase/seed.sql` into the SQL editor, or run `psql "$DATABASE_URL" -f supabase/seed.sql`.
3. Optional: to persist API orders, copy `apps/api/.env.example` to `apps/api/.env` and fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and a `DEMO_USER_ID` (a user from Authentication → Users).

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
- The globe is always the background: drag to rotate, pinch (or scroll on web) to zoom, tap anywhere to pick a location, tap the pin to zoom into it. The Moon and Mars sit where they really are right now.
- The floating bar on the left opens Location, Orders and Account. Drag it anywhere; it fades when idle.
- Search lives at the bottom. Drag it up or tap it to expand. The robot button turns it into the assistant ("barbecue for 8 people"); `a + b + c` searches a bundle.
- Each result shows the S/P/D availability (yellow = recommended, white = available, red = not offered) and ETA. Tap a result for every option, then GET (buy now) or + (add to that store's cart).

## Next steps

- Street-level map when zoomed in (HS 2), via react-native-maps or Mapbox.
- Supabase Auth sign-in and reading the catalogue from the database in the apps.
- Group carts: invite, split by fraction or items, discounts (Orders Interface specs).
- Location add/edit forms (building type, details, label) and sharing.
- Swap the rule-based assistant for an LLM.
