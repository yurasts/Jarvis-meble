alter table public.materials
  add column if not exists is_favorite boolean not null default false;

alter table public.services
  add column if not exists is_favorite boolean not null default false;

comment on column public.materials.is_favorite is
  'Shared staff favorite used to prioritize the project material picker.';

comment on column public.services.is_favorite is
  'Shared staff favorite used to prioritize the project service picker.';

-- Existing materials_all_staff and services_all_staff policies already allow
-- authenticated staff (current_role_name() is not null) to update these rows.
-- Anonymous callers still receive no rows and cannot satisfy WITH CHECK.
