-- Saved locations can carry the School icon (LI 4 / LI 9 label: Home, Work, School, Other).
alter table public.saved_locations drop constraint if exists saved_locations_icon_check;
alter table public.saved_locations add constraint saved_locations_icon_check check (icon in ('home', 'work', 'school', 'pin'));
