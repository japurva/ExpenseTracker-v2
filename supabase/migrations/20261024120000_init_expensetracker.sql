-- ExpenseTracker — initial cloud schema (PostgreSQL 18 / Supabase)
--
-- Apply with:  supabase db push        (CLI, linked project)
--          or: paste into the Supabase SQL editor
--
-- Design notes
--  * Guest mode never writes to these tables. Every cloud row is owned, so
--    `user_id` is NOT NULL here even though the SRS allows NULL for guest rows
--    (those only ever exist in local storage).
--  * `client_id` stores the device-local row id so a retried guest migration is
--    idempotent instead of duplicating rows.
--  * RLS is enabled on every table. Policies call `(select auth.uid())` so the
--    planner evaluates the identity once per statement instead of per row.
--  * Default categories are shared rows (`user_id IS NULL`, `is_default = true`)
--    and are read-only for clients.

begin;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- users — profile mirror of auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email varchar(255) not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete cascade,
  name varchar(100) not null,
  type varchar(20) not null check (type in ('income', 'expense')),
  icon varchar(50),
  color varchar(20),
  is_default boolean not null default false,
  client_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_owner_or_default
    check (is_default or user_id is not null),
  constraint categories_owner_client_key
    unique (user_id, client_id)
);

create index if not exists idx_categories_user on public.categories (user_id);

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  type varchar(20) not null check (type in ('income', 'expense', 'transfer')),
  payment_method varchar(50),
  description text,
  receipt_url text,
  is_ocr_parsed boolean not null default false,
  raw_ocr_text text,
  date timestamptz not null default now(),
  client_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz default now(),
  constraint transactions_owner_client_key
    unique (user_id, client_id)
);

create index if not exists idx_transactions_user_date
  on public.transactions (user_id, date desc);
create index if not exists idx_transactions_category
  on public.transactions (category_id);
create index if not exists idx_transactions_user_payment_method
  on public.transactions (user_id, payment_method);

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- budgets
-- ---------------------------------------------------------------------------
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  monthly_limit numeric(12, 2) not null check (monthly_limit > 0),
  month_year date not null check (extract(day from month_year) = 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_user_category_month_key
    unique (user_id, category_id, month_year)
);

create index if not exists idx_budgets_category on public.budgets (category_id);

drop trigger if exists budgets_set_updated_at on public.budgets;
create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Default categories (shared, read-only)
-- ---------------------------------------------------------------------------
insert into public.categories (id, user_id, name, type, icon, color, is_default)
values
  ('00000000-0000-4000-8000-000000000001', null, 'Food',      'expense', 'utensils',     '#F97316', true),
  ('00000000-0000-4000-8000-000000000002', null, 'Rent',      'expense', 'home',         '#6366F1', true),
  ('00000000-0000-4000-8000-000000000003', null, 'Bills',     'expense', 'receipt',      '#F59E0B', true),
  ('00000000-0000-4000-8000-000000000004', null, 'Shopping',  'expense', 'shopping-bag', '#EC4899', true),
  ('00000000-0000-4000-8000-000000000005', null, 'Transport', 'expense', 'car',          '#3B82F6', true),
  ('00000000-0000-4000-8000-000000000006', null, 'Salary',    'income',  'wallet',       '#10B981', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.users        enable row level security;
alter table public.categories   enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets      enable row level security;

-- users: a user can only see and edit their own profile row.
drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists users_insert_own on public.users;
create policy users_insert_own on public.users
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- categories: own rows plus the shared defaults (read-only).
drop policy if exists categories_select_own_or_default on public.categories;
create policy categories_select_own_or_default on public.categories
  for select to authenticated
  using (user_id = (select auth.uid()) or (user_id is null and is_default));

drop policy if exists categories_insert_own on public.categories;
create policy categories_insert_own on public.categories
  for insert to authenticated
  with check (user_id = (select auth.uid()) and is_default = false);

drop policy if exists categories_update_own on public.categories;
create policy categories_update_own on public.categories
  for update to authenticated
  using (user_id = (select auth.uid()) and is_default = false)
  with check (user_id = (select auth.uid()) and is_default = false);

drop policy if exists categories_delete_own on public.categories;
create policy categories_delete_own on public.categories
  for delete to authenticated
  using (user_id = (select auth.uid()) and is_default = false);

-- transactions: strictly owner-scoped.
drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own on public.transactions
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists transactions_insert_own on public.transactions;
create policy transactions_insert_own on public.transactions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists transactions_update_own on public.transactions;
create policy transactions_update_own on public.transactions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists transactions_delete_own on public.transactions;
create policy transactions_delete_own on public.transactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- budgets: strictly owner-scoped.
drop policy if exists budgets_select_own on public.budgets;
create policy budgets_select_own on public.budgets
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists budgets_insert_own on public.budgets;
create policy budgets_insert_own on public.budgets
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists budgets_update_own on public.budgets;
create policy budgets_update_own on public.budgets
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists budgets_delete_own on public.budgets;
create policy budgets_delete_own on public.budgets
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Privileges — guests are local-only, so `anon` gets nothing.
-- ---------------------------------------------------------------------------
revoke all on public.users, public.categories, public.transactions, public.budgets from anon;
grant select, insert, update, delete
  on public.users, public.categories, public.transactions, public.budgets
  to authenticated;

commit;
