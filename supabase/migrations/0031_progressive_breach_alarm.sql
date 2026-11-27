-- Versioned URL avoids stale browser/CDN audio. Voice duration is unchanged.
update public.media_assets
set storage_path='556ba287-bf5e-4b18-93b7-dd404f36092d/library/mission-v3/nexus-anomaly-alarm.mp3',
    metadata='{"durationMs":47840,"source":"breach-sequence-v3","includesAlarm":true,"progressiveAlarm":true,"voiceDucking":true}'::jsonb,
    updated_at=now()
where event_id='556ba287-bf5e-4b18-93b7-dd404f36092d'
  and logical_key='mission-nexus-alarm-audio' and status='active';
