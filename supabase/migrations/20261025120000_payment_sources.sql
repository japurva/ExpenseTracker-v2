-- ExpenseTracker — payment sources (banks, cards, wallets)
--
-- Additive migration: the initial schema kept payment mode in a free-form
-- `transactions.payment_method` column, which could not express *which* bank or
-- card was used. A user now owns a list of sources and a transaction points at
-- one. `payment_method` stays as the denormalised kind (cash / bank / …) so
-- reporting and legacy rows keep working when a source is deleted.
--
-- Apply with:  supabase db push    (or paste into the SQL editor)

begin;

-- ---------------------------------------------------------------------------
-- payment_sources
-- ---------------------------------------------------------------------------
create table if not exists public.payment_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name varchar(100) not null,
  kind varchar(20) not null default 'other'
    check (kind in ('cash', 'bank', 'credit_card', 'debit_card', 'wallet', 'upi', 'other')),
  last4 varchar(4) check (last4 is null or last4 ~ '^[0-9]{1,4}$'),
  client_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_sources_owner_client_key
    unique (user_id, client_id)
);

create index if not exists idx_payment_sources_user
  on public.payment_sources (user_id, name);

drop trigger if exists payment_sources_set_updated_at on public.payment_sources;
create trigger payment_sources_set_updated_at
  before update on public.payment_sources
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- transactions.payment_source_id
-- ---------------------------------------------------------------------------
alter table public.transactions
  add column if not exists payment_source_id uuid
  references public.payment_sources (id) on delete set null;

create index if not exists idx_transactions_payment_source
  on public.transactions (payment_source_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — strictly owner-scoped, like transactions.
-- ---------------------------------------------------------------------------
alter table public.payment_sources enable row level security;

drop policy if exists payment_sources_select_own on public.payment_sources;
create policy payment_sources_select_own on public.payment_sources
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists payment_sources_insert_own on public.payment_sources;
create policy payment_sources_insert_own on public.payment_sources
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists payment_sources_update_own on public.payment_sources;
create policy payment_sources_update_own on public.payment_sources
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists payment_sources_delete_own on public.payment_sources;
create policy payment_sources_delete_own on public.payment_sources
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Privileges — guests stay local-only.
-- ---------------------------------------------------------------------------
revoke all on public.payment_sources from anon;
grant select, insert, update, delete on public.payment_sources to authenticated;

commit;
