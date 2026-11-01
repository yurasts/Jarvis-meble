-- Autozapis stanu Kalkulatora szafek (Etap B) — praca w kalkulatorze (dodane moduły, wybrane
-- materiały, ustawienia lestniczne) nie może przepadać przy zamknięciu karty projektu czy
-- odświeżeniu strony. UWAGA: "projects" z zadania to w praktyce tabela public.clients — tak w
-- tym repo nazywane są wiersze reprezentujące "Projekt" w UI (patrz np. clientsRepository.js).

alter table public.clients
  add column if not exists calculator_state jsonb not null default '{}'::jsonb;

comment on column public.clients.calculator_state is
  'Autozapisany stan panelu Kalkulator szafek dla tego projektu: { modules, selection, settings }. '
  'Czysto UI-owy stan kalkulatora (nie wpływa na calc_materials/calc_services, dopóki użytkownik '
  'nie kliknie "Dodaj wyliczone pozycje do projektu") — domyślnie {} dla projektów bez kalkulatora.';
