-- The demo New Haven locations get their zip codes (with or without the country already added).
update public.saved_locations
  set address = regexp_replace(address, ', CT(, United States)?$', ', CT 06511, United States')
  where address ~ '^(1 Hillhouse Ave|120 Howe St), New Haven, CT(, United States)?$';
