-- Delete a payment and its allocations atomically without relying on
-- authenticated clients having direct DELETE privileges on either table.
create or replace function public.delete_payment_with_allocations(
  p_payment_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  perform 1
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'payment not found';
  end if;

  delete from public.payment_allocations
  where payment_id = p_payment_id;

  delete from public.payments
  where id = p_payment_id;
end;
$$;

revoke execute on function public.delete_payment_with_allocations(uuid) from public, anon;
grant execute on function public.delete_payment_with_allocations(uuid) to authenticated;
