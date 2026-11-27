-- The Nexus voice/alarm and the complete Glitch film have independent endpoints.
-- The film keeps its embedded AAC soundtrack, so decoder buffering cannot desync it.
insert into public.media_assets(event_id,name,asset_type,storage_path,mime_type,metadata,logical_key,category,character_name,status,default_volume)
values
('556ba287-bf5e-4b18-93b7-dd404f36092d','NEXUS: anomalía con alarma','audio',
 '556ba287-bf5e-4b18-93b7-dd404f36092d/library/mission-v2/nexus-anomaly-alarm.mp3','audio/mpeg',
 '{"durationMs":47840,"source":"breach-sequence-v2","includesAlarm":true}'::jsonb,
 'mission-nexus-alarm-audio','mission','Nexus-9','active',1),
('556ba287-bf5e-4b18-93b7-dd404f36092d','Glitch: intervención completa TV','video',
 '556ba287-bf5e-4b18-93b7-dd404f36092d/library/mission-v2/glitch-intervention-tv.mp4','video/mp4',
 '{"durationMs":130304,"source":"breach-sequence-v2","embeddedAudio":true,"profile":"H264 Baseline 720p AAC"}'::jsonb,
 'mission-glitch-video','videos','Glitch','active',1)
on conflict(event_id,storage_path) do update set metadata=excluded.metadata,logical_key=excluded.logical_key,status='active';
