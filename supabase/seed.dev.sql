-- =============================================================================
-- DEVELOPMENT / DEMO SEED ONLY — never run against a production project.
-- Contains fictional names, rooms, phone numbers and amounts.
-- Apply with: supabase db reset   (local)  or run in a scratch project only.
--
-- NOTE: seed rows go through the same RLS as app writes. Run this as the
-- postgres/service role (SQL editor or `supabase db reset`), not as the
-- browser session.
-- =============================================================================

-- The admin user must exist in auth.users first. Create it in the Supabase
-- dashboard (Authentication → Users → Add user) and replace the id below, or
-- skip this file and use demo mode in the app instead.

insert into public.tenants (name, room_number, phone, monthly_rent, move_in_date, notes)
values
  ('Demo Tenant A', '101', '9876543210', 8500.00, '2025-01-15', 'SEED DATA — sample only'),
  ('Demo Tenant B', '102', '9812345678', 9000.00, '2025-03-01', 'SEED DATA — sample only'),
  ('Demo Tenant C', '201', null,          8000.00, '2024-11-05', 'SEED DATA — sample only')
on conflict do nothing;

insert into public.electricity_meters (meter_code, usc_number, room_label, arrangement, notes)
values
  ('M1', 'DEMO-USC-000001', '101',    'individual', 'SEED DATA — sample only'),
  ('M2', 'DEMO-USC-000002', '102',    'individual', 'SEED DATA — sample only'),
  ('M3', 'DEMO-USC-000003', '201',    'individual', 'SEED DATA — sample only'),
  ('M4', 'DEMO-USC-000004', '202',    'individual', 'SEED DATA — sample only'),
  ('M5', 'DEMO-USC-000005', 'Common', 'shared',     'SEED DATA — shared corridor meter'),
  ('M6', 'DEMO-USC-000006', 'Shop',   'individual', 'SEED DATA — sample only')
on conflict do nothing;

-- M1 → Tenant A, M2 → Tenant B (individual).
insert into public.meter_tenant_assignments (meter_id, tenant_id, allocation_weight)
select m.id, t.id, 1
from public.electricity_meters m
join public.tenants t on (m.meter_code = 'M1' and t.name = 'Demo Tenant A')
                       or (m.meter_code = 'M2' and t.name = 'Demo Tenant B')
where not exists (
  select 1 from public.meter_tenant_assignments a
  where a.meter_id = m.id and a.tenant_id = t.id
);

-- Shared meter M5 split evenly between Tenant A and Tenant B.
insert into public.meter_tenant_assignments (meter_id, tenant_id, allocation_weight)
select m.id, t.id, 1
from public.electricity_meters m
join public.tenants t on t.name in ('Demo Tenant A', 'Demo Tenant B')
where m.meter_code = 'M5'
  and not exists (
    select 1 from public.meter_tenant_assignments a
    where a.meter_id = m.id and a.tenant_id = t.id
  );

-- M3 assigned to Tenant C.
insert into public.meter_tenant_assignments (meter_id, tenant_id, allocation_weight)
select m.id, t.id, 1
from public.electricity_meters m
join public.tenants t on t.name = 'Demo Tenant C'
where m.meter_code = 'M3'
  and not exists (
    select 1 from public.meter_tenant_assignments a
    where a.meter_id = m.id and a.tenant_id = t.id
  );

insert into public.electricity_bills (meter_id, billing_month, amount, bill_generated_at, due_date, status, source, notes)
select m.id, '2026-09', 450.00, date '2026-09-05', date '2026-09-20', 'verified', 'manual_entry', 'SEED DATA'
from public.electricity_meters m where m.meter_code = 'M1'
on conflict (meter_id, billing_month) do nothing;

insert into public.electricity_bills (meter_id, billing_month, amount, bill_generated_at, due_date, status, source, notes)
select m.id, '2026-09', 510.00, date '2026-09-05', date '2026-09-20', 'pending_verification', 'manual_entry', 'SEED DATA'
from public.electricity_meters m where m.meter_code = 'M5'
on conflict (meter_id, billing_month) do nothing;
