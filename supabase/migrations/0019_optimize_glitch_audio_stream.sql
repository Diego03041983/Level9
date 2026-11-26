-- Streamable equivalent of the 34 MB PCM track to reduce TV startup latency.
update public.media_assets
set storage_path='556ba287-bf5e-4b18-93b7-dd404f36092d/library/mission/intervencion-glitch-completa.mp3',
    mime_type='audio/mpeg',
    metadata=jsonb_build_object('durationMs',178144,'source','combined-cinematic','optimizedForTv',true),
    updated_at=now()
where event_id='556ba287-bf5e-4b18-93b7-dd404f36092d'::uuid
  and logical_key='mission-breach-combined-audio';
