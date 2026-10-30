-- A neighborhood, district, city, state/province or country is saved with its
-- outline (a list of {lat, lng} corners) instead of a single pin.
alter table public.saved_locations add column if not exists area jsonb;
