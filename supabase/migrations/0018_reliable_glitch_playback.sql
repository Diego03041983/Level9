-- Browser-safe audio track for the combined Glitch cinematic.
-- The identical extracted track lets Chrome autoplay the muted MP4 reliably.
insert into public.media_assets(
  event_id,name,asset_type,storage_path,mime_type,metadata,
  logical_key,category,character_name,status,default_volume
)
select
  '556ba287-bf5e-4b18-93b7-dd404f36092d'::uuid,
  'Audio intervención Glitch completa','audio',
  '556ba287-bf5e-4b18-93b7-dd404f36092d/library/mission/intervencion-glitch-completa.wav',
  'audio/wav',jsonb_build_object('durationMs',178144,'source','combined-cinematic'),
  'mission-breach-combined-audio','mission','Glitch','active',1
where not exists (
  select 1 from public.media_assets
  where event_id='556ba287-bf5e-4b18-93b7-dd404f36092d'::uuid
    and logical_key='mission-breach-combined-audio' and status <> 'archived'
);

-- Remove the obsolete queue left by the previous failed playback attempts.
update public.scene_events
set status='expired'
where event_id='556ba287-bf5e-4b18-93b7-dd404f36092d'::uuid
  and status in ('queued','delivered','playing')
  and created_at < now() - interval '2 minutes';

update public.audiovisual_events
set status='cancelled', error_message='Reemplazado durante la reparación del reproductor'
where event_id='556ba287-bf5e-4b18-93b7-dd404f36092d'::uuid
  and status in ('pending','queued','playing')
  and created_at < now() - interval '2 minutes';
