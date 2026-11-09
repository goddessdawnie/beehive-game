-- Broaden the existing Possibility property taxonomy without rewriting any activity.
-- Both means the same activity can be done at either property; NULL stays unassigned.
alter table public.activity_catalog
  drop constraint if exists activity_catalog_property_check;
alter table public.activity_catalog
  add constraint activity_catalog_property_check
  check (property is null or property in ('Florence', 'Williamsburg', 'Both'));
