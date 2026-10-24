-- Record administrator changes to operational and financial rows.
-- Trigger execution is transactional with the write, so failed writes do not
-- leave audit entries and successful writes cannot silently skip the trail.

create or replace function public.capture_audit_log()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_entity_id uuid;
begin
  if tg_op = 'INSERT' then
    v_after := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
    if (v_after - 'updated_at') is not distinct from (v_before - 'updated_at') then
      return new;
    end if;
  else
    v_before := to_jsonb(old);
  end if;

  v_entity_id := (coalesce(v_after, v_before) ->> 'id')::uuid;

  insert into public.audit_logs (
    actor_user_id,
    entity_type,
    entity_id,
    action,
    before_data,
    after_data
  )
  values (
    auth.uid(),
    tg_table_name,
    v_entity_id,
    lower(tg_op),
    v_before,
    v_after
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.capture_audit_log() from public, anon, authenticated;

drop trigger if exists audit_tenants on public.tenants;
create trigger audit_tenants
  after insert or update or delete on public.tenants
  for each row execute function public.capture_audit_log();

drop trigger if exists audit_electricity_meters on public.electricity_meters;
create trigger audit_electricity_meters
  after insert or update or delete on public.electricity_meters
  for each row execute function public.capture_audit_log();

drop trigger if exists audit_meter_tenant_assignments on public.meter_tenant_assignments;
create trigger audit_meter_tenant_assignments
  after insert or update or delete on public.meter_tenant_assignments
  for each row execute function public.capture_audit_log();

drop trigger if exists audit_electricity_bills on public.electricity_bills;
create trigger audit_electricity_bills
  after insert or update or delete on public.electricity_bills
  for each row execute function public.capture_audit_log();

drop trigger if exists audit_charges on public.charges;
create trigger audit_charges
  after insert or update or delete on public.charges
  for each row execute function public.capture_audit_log();

drop trigger if exists audit_payments on public.payments;
create trigger audit_payments
  after insert or update or delete on public.payments
  for each row execute function public.capture_audit_log();

drop trigger if exists audit_payment_allocations on public.payment_allocations;
create trigger audit_payment_allocations
  after insert or update or delete on public.payment_allocations
  for each row execute function public.capture_audit_log();

drop trigger if exists audit_reminder_logs on public.reminder_logs;
create trigger audit_reminder_logs
  after insert or update or delete on public.reminder_logs
  for each row execute function public.capture_audit_log();
