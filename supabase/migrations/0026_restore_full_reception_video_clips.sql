-- The first edit stopped several original clips mid-shot. Publish the complete
-- source clips in three pieces, preserving the nickname and photo pauses.
with clips(scene_key, file_name, title, duration_ms) as (
  values
    ('DETECTION', 'before-nickname.mp4', 'Alta completa: antes del nickname', 75917),
    ('NICKNAME_CONFIRMED', 'before-photo.mp4', 'Alta completa: antes de la foto', 16042),
    ('AVATAR_PROCESSING', 'after-photo.mp4', 'Alta completa: después de la foto', 63417),
    (null, 'film.mp4', 'Alta completa: película entera', 155375)
)
insert into public.media_assets(event_id, name, asset_type, storage_path, mime_type, metadata, category, status)
select '556ba287-bf5e-4b18-93b7-dd404f36092d'::uuid, title, 'video',
  '556ba287-bf5e-4b18-93b7-dd404f36092d/reception-film/v2/' || file_name,
  'video/mp4', jsonb_build_object('durationMs', duration_ms, 'source', 'complete-original-clips'),
  'videos', 'active'
from clips
on conflict (event_id, storage_path) do update
set metadata=excluded.metadata, name=excluded.name, status='active';

with clips(scene_key, file_name) as (
  values
    ('DETECTION', 'before-nickname.mp4'),
    ('NICKNAME_CONFIRMED', 'before-photo.mp4'),
    ('AVATAR_PROCESSING', 'after-photo.mp4')
)
insert into public.reception_media_assignments(event_id, participant_id, scene_key, media_kind, media_asset_id)
select '556ba287-bf5e-4b18-93b7-dd404f36092d'::uuid, null, clips.scene_key, 'video', assets.id
from clips
join public.media_assets assets
  on assets.event_id='556ba287-bf5e-4b18-93b7-dd404f36092d'::uuid
  and assets.storage_path='556ba287-bf5e-4b18-93b7-dd404f36092d/reception-film/v2/' || clips.file_name
on conflict (event_id, participant_id, scene_key, media_kind) do update
set media_asset_id=excluded.media_asset_id, loop=false;
