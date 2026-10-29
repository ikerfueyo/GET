-- Every address ends with its country. Fixes the demo locations seeded before that.
update public.saved_locations set address = address || ', United States' where address like '%, CT';
update public.saved_locations set address = address || ', Mexico' where address = 'Polanco, Ciudad de México';
update public.saved_locations set address = replace(replace(replace(address, ', México', ', Mexico'), ', España', ', Spain'), ', Brasil', ', Brazil')
  where address like '%, México' or address like '%, España' or address like '%, Brasil';
