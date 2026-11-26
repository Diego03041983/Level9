-- The competition center must read group rosters and scores under user RLS.
create or replace function public.challenge_event(p_challenge uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select event_id from public.challenges where id=p_challenge;
$$;
revoke all on function public.challenge_event(uuid) from public,anon;
grant execute on function public.challenge_event(uuid) to authenticated;

create policy challenge_participants_member_select on public.challenge_participants
for select to authenticated
using(public.has_event_role(public.challenge_event(challenge_id),array['owner','admin','operator','display']));

create policy challenge_results_member_select on public.challenge_results
for select to authenticated
using(public.has_event_role(public.challenge_event(challenge_id),array['owner','admin','operator','display']));
