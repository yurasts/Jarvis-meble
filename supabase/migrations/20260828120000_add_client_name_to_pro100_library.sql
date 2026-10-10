-- Optional customer label for reusable PRO100 library entries.
-- Kept as text because a library file is not required to belong to a live project.
alter table public.pro100_library_files
  add column client_name text

alter table public.pro100_library_files
  add constraint pro100_library_files_client_name_length
  check (client_name is null or char_length(trim(client_name)) between 1 and 140)

