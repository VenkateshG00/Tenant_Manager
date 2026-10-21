-- =============================================================================
-- Row Level Security — single administrator app.
-- Every policy requires a row in public.admins; nothing is publicly readable.
-- Tenant phone numbers and financial records are never exposed to anon.
-- =============================================================================

alter table public.tenants enable row level security;
alter table public.electricity_meters enable row level security;
alter table public.meter_tenant_assignments enable row level security;
alter table public.electricity_bills enable row level security;
alter table public.charges enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.reminder_logs enable row level security;
alter table public.audit_logs enable row level security;

-- Drop any previously created policies (idempotent re-runs).
do $$
declare
  t text;
  p text;
begin
  foreach t in array array['tenants','electricity_meters','meter_tenant_assignments',
                           'electricity_bills','charges','payments','payment_allocations',
                           'reminder_logs','audit_logs','admins']
  loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', p, t);
    end loop;
  end loop;
end $$;

-- tenants -------------------------------------------------------------------
create policy "tenants: admin read"   on public.tenants for select using (public.is_admin());
create policy "tenants: admin write"  on public.tenants for insert with check (public.is_admin());
create policy "tenants: admin update" on public.tenants for update using (public.is_admin()) with check (public.is_admin());
create policy "tenants: admin delete" on public.tenants for delete using (public.is_admin());

-- electricity_meters --------------------------------------------------------
create policy "meters: admin read"   on public.electricity_meters for select using (public.is_admin());
create policy "meters: admin write"  on public.electricity_meters for insert with check (public.is_admin());
create policy "meters: admin update" on public.electricity_meters for update using (public.is_admin()) with check (public.is_admin());
create policy "meters: admin delete" on public.electricity_meters for delete using (public.is_admin());

-- meter_tenant_assignments --------------------------------------------------
create policy "assignments: admin read"   on public.meter_tenant_assignments for select using (public.is_admin());
create policy "assignments: admin write"  on public.meter_tenant_assignments for insert with check (public.is_admin());
create policy "assignments: admin update" on public.meter_tenant_assignments for update using (public.is_admin()) with check (public.is_admin());
create policy "assignments: admin delete" on public.meter_tenant_assignments for delete using (public.is_admin());

-- electricity_bills ---------------------------------------------------------
create policy "bills: admin read"   on public.electricity_bills for select using (public.is_admin());
create policy "bills: admin write"  on public.electricity_bills for insert with check (public.is_admin());
create policy "bills: admin update" on public.electricity_bills for update using (public.is_admin()) with check (public.is_admin());
create policy "bills: admin delete" on public.electricity_bills for delete using (public.is_admin());

-- charges -------------------------------------------------------------------
create policy "charges: admin read"   on public.charges for select using (public.is_admin());
create policy "charges: admin write"  on public.charges for insert with check (public.is_admin());
create policy "charges: admin update" on public.charges for update using (public.is_admin()) with check (public.is_admin());
create policy "charges: admin delete" on public.charges for delete using (public.is_admin());

-- payments ------------------------------------------------------------------
create policy "payments: admin read"   on public.payments for select using (public.is_admin());
create policy "payments: admin write"  on public.payments for insert with check (public.is_admin());
create policy "payments: admin update" on public.payments for update using (public.is_admin()) with check (public.is_admin());
create policy "payments: admin delete" on public.payments for delete using (public.is_admin());

-- payment_allocations -------------------------------------------------------
create policy "allocations: admin read"   on public.payment_allocations for select using (public.is_admin());
create policy "allocations: admin write"  on public.payment_allocations for insert with check (public.is_admin());
create policy "allocations: admin delete" on public.payment_allocations for delete using (public.is_admin());

-- reminder_logs -------------------------------------------------------------
create policy "reminders: admin read"   on public.reminder_logs for select using (public.is_admin());
create policy "reminders: admin write"  on public.reminder_logs for insert with check (public.is_admin());
create policy "reminders: admin update" on public.reminder_logs for update using (public.is_admin()) with check (public.is_admin());
create policy "reminders: admin delete" on public.reminder_logs for delete using (public.is_admin());

-- audit_logs — append-only --------------------------------------------------
create policy "audit: admin read"  on public.audit_logs for select using (public.is_admin());
create policy "audit: admin write" on public.audit_logs for insert with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- anon gets nothing: no grants beyond the default table privileges are added.
-- ---------------------------------------------------------------------------
revoke all on public.tenants, public.electricity_meters, public.meter_tenant_assignments,
  public.electricity_bills, public.charges, public.payments, public.payment_allocations,
  public.reminder_logs, public.audit_logs, public.admins from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
