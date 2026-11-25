-- One-time, short TV pairing links. The short code is stored only as a hash.
create table public.display_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.display_devices(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index display_pairing_codes_expiry_idx on public.display_pairing_codes(expires_at) where consumed_at is null;
alter table public.display_pairing_codes enable row level security;
revoke all on public.display_pairing_codes from public, anon, authenticated;

create or replace function public.redeem_display_pairing_code(
  p_code_hash text,
  p_session_token_hash text
) returns table (event_id uuid, device_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  pairing public.display_pairing_codes%rowtype;
begin
  select * into pairing
  from public.display_pairing_codes
  where code_hash = p_code_hash
    and consumed_at is null
    and expires_at > now()
  for update;
  if not found then
    raise exception 'pairing code invalid or expired' using errcode = '42501';
  end if;
  if not exists (select 1 from public.display_devices d where d.id = pairing.device_id and d.revoked_at is null) then
    raise exception 'display revoked' using errcode = '42501';
  end if;

  update public.display_sessions
  set token_hash = p_session_token_hash,
      expires_at = now() + interval '7 days',
      revoked_at = null,
      last_seen_at = now()
  where display_sessions.device_id = pairing.device_id;
  update public.display_pairing_codes set consumed_at = now() where id = pairing.id;

  return query
  select d.event_id, d.id from public.display_devices d where d.id = pairing.device_id;
end;
$$;

revoke all on function public.redeem_display_pairing_code(text,text) from public, anon, authenticated;
grant execute on function public.redeem_display_pairing_code(text,text) to service_role;
