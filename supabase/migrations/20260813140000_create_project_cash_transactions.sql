-- Mobile / Client Balance / Expanded v1 — единый источник реальных денежных операций проекта.
-- Bilans klienta и вкладка Rozliczenia в mobile ProjectModal читают/пишут ОДИН и тот же массив
-- строк этой таблицы (без копирования данных между экранами). НЕ путать с clients.calc_expenses —
-- это legacy/расчётные позиции сметы (плановые, не денежный поток), остаются как есть, не
-- мигрируются и не трактуются автоматически как реальные расходы.
--
-- ВАЖНО: шаблон миграции, приложенный к заданию, объявлял
--   project_id uuid not null references public.clients(id) on delete cascade
-- Это несовместимо с реальной живой схемой: clients.id — bigint (см. docs/DB_LIVE_BASELINE.md,
-- §1.1: "id | bigint | NOT NULL | — (PK)"), не uuid. FK с типом uuid на bigint-колонку Postgres
-- отклонит при попытке создать constraint (несовместимые типы). Ниже project_id исправлен на
-- bigint — единственное отличие от присланного шаблона, кроме собственно RLS-политик (в задании
-- явно указано их не придумывать заранее, а изучить действующие).

create table public.project_cash_transactions (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null references public.clients(id) on delete cascade,
  direction text not null check (direction in ('inflow', 'outflow')),
  amount numeric(12,2) not null check (amount > 0),
  occurred_on date not null default current_date,
  description text not null
    check (char_length(trim(description)) between 1 and 200),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)

create index project_cash_transactions_project_id_idx
  on public.project_cash_transactions (project_id)

create index project_cash_transactions_project_id_occurred_on_idx
  on public.project_cash_transactions (project_id, occurred_on desc)

-- default now() на updated_at действует только при INSERT — при UPDATE колонка сама себя не
-- обновляет, её обязан выставить триггер. Тем же триггером (а не отдельным) закрываем и
-- P2-замечание ревью про project_id/created_by/created_at: фронтенд и сейчас не передаёт их в
-- .update() (см. saveCashTransaction, App.jsx), но БД не должна полагаться на дисциплину клиента —
-- ниже NEW принудительно возвращается к OLD для этих трёх колонок при любом UPDATE, независимо от
-- того, что именно попытались отправить.
create or replace function public.project_cash_transactions_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.project_id := old.project_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$

create trigger project_cash_transactions_set_updated_at
  before update on public.project_cash_transactions
  for each row
  execute function public.project_cash_transactions_set_updated_at()

-- RLS смоделирован по образцу уже действующей clients_select_by_role (docs/DB_LIVE_BASELINE.md,
-- §2): owner/assembler видят все строки clients; designer/installer — только строки, где они
-- назначены (assigned_designer/assigned_installer = auth.uid()); anon — не видит ничего (нет
-- табличного гранта, и current_role_name() для анонима возвращает NULL, все сравнения ложны).
--
-- Вместо копирования этой ролевой матрицы сюда, политики ниже используют EXISTS-подзапрос к самой
-- clients. Postgres выполняет подзапрос в контексте текущего пользователя (это НЕ SECURITY
-- DEFINER-функция), поэтому подзапрос сам подчиняется RLS clients: если пользователь не видит
-- нужную строку clients (например, designer не назначен на этот проект), EXISTS будет false и
-- здесь — доступ к операциям этого проекта закрыт, ровно как того требует задание ("не дают
-- доступ к операциям проекта, если он не видит соответствующую строку clients"). Если политика
-- clients в будущем изменится (например, изменится ролевая матрица) — эта таблица автоматически
-- последует за ней без отдельного редактирования и без риска рассинхронизации двух копий одной
-- и той же логики.
--
-- Единая функция условия (используется в USING/WITH CHECK всех четырёх политик) — умышленно НЕ
-- вынесена в SQL-функцию/VIEW, чтобы не плодить дополнительный объект схемы ради четырёх мест
-- использования; сам EXISTS(...) — однострочный и идентичен во всех политиках.

alter table public.project_cash_transactions enable row level security

create policy project_cash_transactions_select_if_client_visible
  on public.project_cash_transactions
  for select
  using (
    exists (
      select 1 from public.clients c
      where c.id = project_cash_transactions.project_id
    )
  )

create policy project_cash_transactions_insert_if_client_visible
  on public.project_cash_transactions
  for insert
  with check (
    exists (
      select 1 from public.clients c
      where c.id = project_cash_transactions.project_id
    )
  )

create policy project_cash_transactions_update_if_client_visible
  on public.project_cash_transactions
  for update
  using (
    exists (
      select 1 from public.clients c
      where c.id = project_cash_transactions.project_id
    )
  )
  with check (
    exists (
      select 1 from public.clients c
      where c.id = project_cash_transactions.project_id
    )
  )

create policy project_cash_transactions_delete_if_client_visible
  on public.project_cash_transactions
  for delete
  using (
    exists (
      select 1 from public.clients c
      where c.id = project_cash_transactions.project_id
    )
  )

-- НЕ применено к живой БД: ни supabase db push, ни SQL Editor, ни любой другой канал записи в
-- рамках этой задачи не использовались. Файл существует только локально в рабочем дереве этого
-- репозитория, не закоммичен.

