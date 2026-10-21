-- =============================================================================
-- Electricity & Rent Management Dashboard — initial schema
-- Apply with: supabase db push  (or paste into the Supabase SQL editor)
-- All money columns are numeric(14,2) — exact decimal, never float.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.charge_type as enum ('rent', 'electricity', 'other', 'credit');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.bill_status as enum ('pending_verification', 'verified', 'paid', 'void');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.bill_source as enum ('manual_entry', 'official_lookup');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_method as enum ('cash', 'upi', 'bank_transfer', 'cheque', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.reminder_status as enum ('prepared', 'sent', 'skipped');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Updated-at trigger helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- admins — gates every RLS policy (single-administrator app)
-- ---------------------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- is_admin() is created before any policy that uses it. The body is only
-- parsed at creation time, so the admins table it references may be created
-- in the same statement batch.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  room_number text not null check (length(trim(room_number)) > 0),
  phone text,
  monthly_rent numeric(14, 2) not null check (monthly_rent >= 0),
  move_in_date date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tenants_active_idx on public.tenants (is_active);
create index if not exists tenants_name_idx on public.tenants (lower(name));

drop trigger if exists tenants_updated_at on public.tenants;
create trigger tenants_updated_at before update on public.tenants
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- electricity_meters
-- ---------------------------------------------------------------------------
create table if not exists public.electricity_meters (
  id uuid primary key default gen_random_uuid(),
  meter_code text not null unique check (length(trim(meter_code)) > 0),
  usc_number text not null unique check (length(trim(usc_number)) > 0),
  room_label text not null check (length(trim(room_label)) > 0),
  arrangement text not null default 'individual'
    check (arrangement in ('individual', 'shared', 'multi_per_tenant')),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists electricity_meters_active_idx on public.electricity_meters (is_active);

drop trigger if exists electricity_meters_updated_at on public.electricity_meters;
create trigger electricity_meters_updated_at before update on public.electricity_meters
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- meter_tenant_assignments — explicit allocation rules for shared meters
-- allocation_weight: relative integer weight (1:1 => 1 and 1; 2:1 => 2 and 1)
-- ---------------------------------------------------------------------------
create table if not exists public.meter_tenant_assignments (
  id uuid primary key default gen_random_uuid(),
  meter_id uuid not null references public.electricity_meters (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  allocation_weight integer not null default 1 check (allocation_weight > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meter_id, tenant_id)
);

create index if not exists meter_assignments_tenant_idx
  on public.meter_tenant_assignments (tenant_id);
create index if not exists meter_assignments_meter_idx
  on public.meter_tenant_assignments (meter_id);

drop trigger if exists meter_assignments_updated_at on public.meter_tenant_assignments;
create trigger meter_assignments_updated_at before update on public.meter_tenant_assignments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- electricity_bills — no duplicate bill per meter + billing period
-- ---------------------------------------------------------------------------
create table if not exists public.electricity_bills (
  id uuid primary key default gen_random_uuid(),
  meter_id uuid not null references public.electricity_meters (id) on delete restrict,
  billing_month text not null check (billing_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount numeric(14, 2) not null check (amount > 0),
  bill_generated_at date,
  due_date date,
  bill_reference text,
  receipt_url text,
  status public.bill_status not null default 'pending_verification',
  source public.bill_source not null default 'manual_entry',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Duplicate prevention: one bill per meter per billing month.
create unique index if not exists electricity_bills_meter_month_uidx
  on public.electricity_bills (meter_id, billing_month);
create index if not exists electricity_bills_month_idx
  on public.electricity_bills (billing_month);
create index if not exists electricity_bills_status_idx
  on public.electricity_bills (status);

drop trigger if exists electricity_bills_updated_at on public.electricity_bills;
create trigger electricity_bills_updated_at before update on public.electricity_bills
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- charges — the auditable ledger of everything owed
-- ---------------------------------------------------------------------------
create table if not exists public.charges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  charge_type public.charge_type not null,
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  charge_date date not null,
  amount numeric(14, 2) not null,
  description text,
  source_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint charges_amount_sign check (
    (charge_type in ('rent', 'electricity', 'other') and amount >= 0)
    or (charge_type = 'credit' and amount <= 0)
  )
);

-- One charge of a given type per tenant per period per source.
-- source_id is null for rent/other charges, bill id for electricity charges.
create unique index if not exists charges_tenant_type_period_source_uidx
  on public.charges (tenant_id, charge_type, period, coalesce(source_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists charges_tenant_date_idx on public.charges (tenant_id, charge_date);
create index if not exists charges_period_idx on public.charges (period);

drop trigger if exists charges_updated_at on public.charges;
create trigger charges_updated_at before update on public.charges
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  payment_date date not null,
  amount numeric(14, 2) not null check (amount > 0),
  method public.payment_method not null default 'cash',
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_tenant_date_idx on public.payments (tenant_id, payment_date);
create index if not exists payments_date_idx on public.payments (payment_date);

drop trigger if exists payments_updated_at on public.payments;
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payment_allocations — FIFO, oldest charge first
-- ---------------------------------------------------------------------------
create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  charge_id uuid not null references public.charges (id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (payment_id, charge_id)
);

create index if not exists payment_allocations_charge_idx
  on public.payment_allocations (charge_id);

-- ---------------------------------------------------------------------------
-- reminder_logs — records what the administrator actually did
-- ---------------------------------------------------------------------------
create table if not exists public.reminder_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status public.reminder_status not null default 'prepared',
  channel text not null default 'whatsapp',
  message text not null,
  phone_digits text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reminder_logs_tenant_period_idx
  on public.reminder_logs (tenant_id, period);

drop trigger if exists reminder_logs_updated_at on public.reminder_logs;
create trigger reminder_logs_updated_at before update on public.reminder_logs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- audit_logs — append-only record of corrections to financial records
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- RPCs — thin, transactional write paths (business logic lives in the app
-- and is unit-tested; these RPCs validate invariants and insert atomically).
-- ---------------------------------------------------------------------------

-- Idempotently create the monthly rent charge for every active tenant.
create or replace function public.ensure_rent_charges(p_period text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'invalid period';
  end if;

  insert into public.charges (tenant_id, charge_type, period, charge_date, amount, description)
  select t.id, 'rent'::public.charge_type, p_period,
         (p_period || '-01')::date, t.monthly_rent,
         'Monthly rent for ' || p_period
  from public.tenants t
  where t.is_active = true
    and not exists (
      select 1 from public.charges c
      where c.tenant_id = t.id
        and c.charge_type = 'rent'
        and c.period = p_period
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Atomically record a payment and its FIFO allocations.
create or replace function public.record_payment_with_allocations(
  p_tenant_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_method public.payment_method,
  p_reference text,
  p_notes text,
  p_allocations jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_alloc_total numeric := 0;
  v_row jsonb;
  v_charge_amount numeric;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'payment amount must be positive';
  end if;
  if not exists (select 1 from public.tenants t where t.id = p_tenant_id) then
    raise exception 'tenant not found';
  end if;

  insert into public.payments (tenant_id, payment_date, amount, method, reference, notes)
  values (p_tenant_id, p_payment_date, p_amount, p_method, p_reference, p_notes)
  returning id into v_payment_id;

  if p_allocations is not null then
    for v_row in select * from jsonb_array_elements(p_allocations) loop
      if (v_row ->> 'amount')::numeric <= 0 then
        raise exception 'allocation amount must be positive';
      end if;
      select c.amount into v_charge_amount
      from public.charges c
      where c.id = (v_row ->> 'charge_id')::uuid
        and c.tenant_id = p_tenant_id
      for update;
      if v_charge_amount is null then
        raise exception 'charge not found for this tenant';
      end if;
      insert into public.payment_allocations (payment_id, charge_id, amount)
      values (v_payment_id, (v_row ->> 'charge_id')::uuid, (v_row ->> 'amount')::numeric);
      v_alloc_total := v_alloc_total + (v_row ->> 'amount')::numeric;
    end loop;
  end if;

  if v_alloc_total > p_amount then
    raise exception 'allocations exceed payment amount';
  end if;

  return v_payment_id;
end;
$$;

-- Lock RPC execution to signed-in users (is_admin() still gates the bodies).
revoke execute on function public.ensure_rent_charges(text) from public, anon;
revoke execute on function public.record_payment_with_allocations(uuid, date, numeric, public.payment_method, text, text, jsonb) from public, anon;
grant execute on function public.ensure_rent_charges(text) to authenticated;
grant execute on function public.record_payment_with_allocations(uuid, date, numeric, public.payment_method, text, text, jsonb) to authenticated;
