-- Resources: region becomes a closed list (the three dialect areas + 'Autre') so the data stays clean.
-- Mirrors RESOURCE_REGIONS in web/lib/regions.ts. NULL stays allowed: the field is optional.
-- Not NOT VALID on purpose: if a free-text value outside the list exists, this fails loudly
-- instead of silently accepting or rewriting it.
alter table community_texts drop constraint if exists community_texts_region_check;
alter table community_texts
  add constraint community_texts_region_check
  check (region is null or region in ('Guibéroua', 'Gagnoa', 'Daloa', 'Autre'));
