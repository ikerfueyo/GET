-- GET: initial schema.
-- Catalogue tables (stores, products, offers) hold the simulated world
-- inventory and are readable by anyone. Everything else belongs to a user
-- and is protected by row level security.

create type public.fulfilment_mode as enum ('in_store', 'pickup', 'delivery');
create type public.order_status as enum ('confirmed', 'preparing', 'on_the_way', 'ready', 'completed', 'cancelled');
create type public.member_role as enum ('owner', 'admin', 'member');

-- ───────────── Catalogue ─────────────

create table public.stores (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('physical', 'online')),
  category text not null,
  address text not null,
  city text not null,
  country text not null,
  currency text not null,
  lat double precision not null,
  lng double precision not null,
  rating numeric(2,1) not null default 4.0,
  verified boolean not null default false,
  has_pickup boolean not null default false,
  has_delivery boolean not null default false,
  delivery_radius_km numeric not null default 12,
  ships_international boolean not null default false,
  prep_minutes integer not null default 12,
  hours text not null default ''
);
create index stores_lat_lng_idx on public.stores (lat, lng);

-- array_to_string is only STABLE; generated columns need an IMMUTABLE expression
create function public.join_tags(tags text[]) returns text
language sql immutable as $$ select array_to_string(tags, ' ') $$;

create table public.products (
  id text primary key,
  name text not null,
  brand text not null,
  category text not null,
  description text not null default '',
  tags text[] not null default '{}',
  glyph text not null default '',
  base_price_usd numeric(12,2) not null,
  requirements text[] not null default '{}',
  is_service boolean not null default false,
  search tsvector generated always as (
    to_tsvector('simple', name || ' ' || brand || ' ' || category || ' ' || public.join_tags(tags))
  ) stored
);
create index products_search_idx on public.products using gin (search);

create table public.offers (
  id text primary key,
  product_id text not null references public.products (id) on delete cascade,
  store_id text not null references public.stores (id) on delete cascade,
  price numeric(12,2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  inventory_verified boolean not null default false,
  modes public.fulfilment_mode[] not null,
  delivery_fee numeric(12,2) not null default 0,
  unique (product_id, store_id)
);
create index offers_product_idx on public.offers (product_id);
create index offers_store_idx on public.offers (store_id);

-- ───────────── People ─────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  username text unique,
  phone text,
  currency text not null default 'USD',
  get_cash_usd numeric(12,2) not null default 150, -- simulated starting balance
  created_at timestamptz not null default now()
);

-- create a profile row whenever someone signs up
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.saved_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text not null,
  icon text not null default 'pin' check (icon in ('home', 'work', 'pin')),
  address text not null,
  lat double precision not null,
  lng double precision not null,
  building_type text check (building_type in ('House', 'Apartment', 'Office', 'Hotel', 'Other')),
  details text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- Fake payment methods only: the full card number is never stored.
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('card', 'get_cash')),
  brand text not null,
  last4 text not null default '',
  label text not null,
  exp_month smallint,
  exp_year smallint,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id text references public.products (id) on delete cascade,
  store_id text references public.stores (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((product_id is null) <> (store_id is null))
);
create unique index favorites_unique_idx on public.favorites (user_id, coalesce(product_id, ''), coalesce(store_id, ''));

-- ───────────── Carts (shared, multi-store) ─────────────

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text,
  location jsonb,
  split_mode text not null default 'fraction' check (split_mode in ('fraction', 'items')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cart_members (
  cart_id uuid not null references public.carts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'member',
  confirmed boolean not null default false,
  primary key (cart_id, user_id)
);

-- one cart can span several stores; each store is a tab with its own mode
create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete cascade,
  offer_id text not null references public.offers (id),
  mode public.fulfilment_mode not null,
  quantity integer not null default 1 check (quantity > 0),
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create function public.is_cart_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cart_members where cart_id = c and user_id = auth.uid())
$$;

-- ───────────── Orders, payments, reservations ─────────────

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  cart_id uuid references public.carts (id) on delete set null,
  store_id text not null references public.stores (id),
  mode public.fulfilment_mode not null,
  status public.order_status not null default 'confirmed',
  currency text not null,
  subtotal numeric(12,2) not null,
  fees numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  deliver_to jsonb,
  placed_at timestamptz not null default now(),
  eta_at timestamptz
);
create index orders_user_idx on public.orders (user_id, placed_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  offer_id text references public.offers (id) on delete set null,
  product_id text references public.products (id) on delete set null,
  name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null
);

-- every payment is simulated; several payments can settle one order (split order)
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  payment_method_id uuid references public.payment_methods (id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null,
  status text not null default 'succeeded' check (status in ('succeeded', 'declined', 'refunded')),
  simulated boolean not null default true check (simulated),
  created_at timestamptz not null default now()
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  store_id text not null references public.stores (id),
  product_id text references public.products (id),
  starts_at timestamptz not null,
  party_size integer not null default 1,
  status text not null default 'booked' check (status in ('booked', 'cancelled', 'completed')),
  notes text,
  created_at timestamptz not null default now()
);

-- ───────────── Row level security ─────────────

alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.offers enable row level security;
create policy "catalogue is public" on public.stores for select using (true);
create policy "catalogue is public" on public.products for select using (true);
create policy "catalogue is public" on public.offers for select using (true);

alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());

alter table public.saved_locations enable row level security;
alter table public.payment_methods enable row level security;
alter table public.favorites enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.reservations enable row level security;
create policy "own rows" on public.saved_locations for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.payment_methods for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.orders for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.payments for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.reservations for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.order_items enable row level security;
create policy "items of own orders" on public.order_items for all
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()))
  with check (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

alter table public.carts enable row level security;
alter table public.cart_members enable row level security;
alter table public.cart_items enable row level security;
create policy "members see carts" on public.carts for select using (owner_id = auth.uid() or public.is_cart_member(id));
create policy "owner creates carts" on public.carts for insert with check (owner_id = auth.uid());
create policy "members edit carts" on public.carts for update using (owner_id = auth.uid() or public.is_cart_member(id));
create policy "owner deletes carts" on public.carts for delete using (owner_id = auth.uid());
create policy "members see members" on public.cart_members for select using (public.is_cart_member(cart_id) or user_id = auth.uid());
create policy "owner manages members" on public.cart_members for all
  using (exists (select 1 from public.carts c where c.id = cart_id and c.owner_id = auth.uid()) or user_id = auth.uid())
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.owner_id = auth.uid()) or user_id = auth.uid());
create policy "members edit items" on public.cart_items for all
  using (public.is_cart_member(cart_id)) with check (public.is_cart_member(cart_id));
