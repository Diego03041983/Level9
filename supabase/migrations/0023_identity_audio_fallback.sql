-- A player without a name-specific WAV still hears the generic detection prompt.
insert into public.reception_media_assignments(
  event_id,participant_id,scene_key,media_kind,media_asset_id,cue_ms,loop,volume
)
select detection.event_id,null,'IDENTITY_REVEAL','audio',
  detection.media_asset_id,0,false,detection.volume
from public.reception_media_assignments detection
where detection.scene_key='DETECTION' and detection.media_kind='audio'
  and detection.participant_id is null
  and not exists(
    select 1 from public.reception_media_assignments existing
    where existing.event_id=detection.event_id and existing.scene_key='IDENTITY_REVEAL'
      and existing.media_kind='audio' and existing.participant_id is null
  )
on conflict(event_id,participant_id,scene_key,media_kind) do nothing;
