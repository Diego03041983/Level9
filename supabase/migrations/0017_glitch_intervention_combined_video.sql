-- Gapless SYSTEM BREACH: anomaly first, then Glitch intervention, with embedded audio.
insert into public.media_assets(
  event_id,name,asset_type,storage_path,mime_type,metadata,
  logical_key,category,character_name,status,default_volume
)
select
  '556ba287-bf5e-4b18-93b7-dd404f36092d'::uuid,
  'Intervención Glitch completa','video',
  '556ba287-bf5e-4b18-93b7-dd404f36092d/library/mission/intervencion-glitch-completa.mp4',
  'video/mp4',
  jsonb_build_object('durationMs',178144,'source','combined-cinematic','sequence',jsonb_build_array('anomaly-detected','glitch-intervention')),
  'mission-breach-combined-video','videos','Glitch','active',1
where not exists (
  select 1 from public.media_assets
  where event_id='556ba287-bf5e-4b18-93b7-dd404f36092d'::uuid
    and logical_key='mission-breach-combined-video' and status <> 'archived'
);
