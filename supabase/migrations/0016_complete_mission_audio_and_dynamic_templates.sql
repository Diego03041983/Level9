-- Complete the remaining available mission resources and repair dynamic templates.

with resources(logical_key,name,category,character_name,duration_ms) as (
  values
    ('glitch-mission-intro','Introducción de Glitch','mission','Glitch',129050),
    ('access-denied','Acceso denegado','mission','Glitch',900),
    ('access-granted','Acceso concedido','mission','Nexus-9',1400)
)
insert into public.media_assets(event_id,name,asset_type,storage_path,mime_type,metadata,logical_key,category,character_name,status,default_volume)
select
  '556ba287-bf5e-4b18-93b7-dd404f36092d'::uuid,r.name,'audio',
  '556ba287-bf5e-4b18-93b7-dd404f36092d/library/catalog-audio/' || r.logical_key || '.wav',
  'audio/wav',jsonb_build_object('durationMs',r.duration_ms,'source','local-audio-catalog'),
  r.logical_key,r.category,r.character_name,'active',1
from resources r
where not exists (
  select 1 from public.media_assets m
  where m.event_id='556ba287-bf5e-4b18-93b7-dd404f36092d'::uuid
    and m.logical_key=r.logical_key and m.status <> 'archived'
);

update public.media_assets
set storage_path='556ba287-bf5e-4b18-93b7-dd404f36092d/library/character-video/glitch.mp4',
    metadata=jsonb_build_object('durationMs',130304,'source','character-video'),
    updated_at=now()
where event_id='556ba287-bf5e-4b18-93b7-dd404f36092d'::uuid
  and logical_key='character-glitch-video';

delete from public.announcement_segments
where template_id in (
  select id from public.announcement_templates
  where event_id='556ba287-bf5e-4b18-93b7-dd404f36092d'::uuid
    and template_key in ('MATCH_CALLED','METEGOL_NEXT_MATCH','ROBLOX_PLAYERS_CALLED','CHAMPION_CONFIRMED','PLAYER_ACTIVATED','MISSION_BREACH','MISSION_WARNING_15','MISSION_WARNING_5','MISSION_WARNING_1')
);

with segments(template_key,position,segment_type,config,optional,volume) as (
  values
    ('MATCH_CALLED',1,'fixed_audio',jsonb_build_object('logicalKey','fifa-next-match'),false,1::numeric),
    ('MATCH_CALLED',2,'silence',jsonb_build_object('durationMs',160),true,0),
    ('MATCH_CALLED',3,'participant_audio',jsonb_build_object('index',0,'role','name'),false,1),
    ('MATCH_CALLED',4,'silence',jsonb_build_object('durationMs',160),true,0),
    ('MATCH_CALLED',5,'fixed_audio',jsonb_build_object('logicalKey','versus'),false,1),
    ('MATCH_CALLED',6,'silence',jsonb_build_object('durationMs',160),true,0),
    ('MATCH_CALLED',7,'participant_audio',jsonb_build_object('index',1,'role','name'),false,1),
    ('MATCH_CALLED',8,'silence',jsonb_build_object('durationMs',160),true,0),
    ('MATCH_CALLED',9,'fixed_audio',jsonb_build_object('logicalKey','playstation-call'),false,1),
    ('METEGOL_NEXT_MATCH',1,'fixed_audio',jsonb_build_object('logicalKey','metegol-next-match'),false,1),
    ('METEGOL_NEXT_MATCH',2,'fixed_audio',jsonb_build_object('logicalKey','team-one'),false,1),
    ('METEGOL_NEXT_MATCH',3,'participant_audio',jsonb_build_object('index',0,'role','name'),false,1),
    ('METEGOL_NEXT_MATCH',4,'fixed_audio',jsonb_build_object('logicalKey','and'),false,1),
    ('METEGOL_NEXT_MATCH',5,'participant_audio',jsonb_build_object('index',1,'role','name'),false,1),
    ('METEGOL_NEXT_MATCH',6,'fixed_audio',jsonb_build_object('logicalKey','versus'),false,1),
    ('METEGOL_NEXT_MATCH',7,'fixed_audio',jsonb_build_object('logicalKey','team-two'),false,1),
    ('METEGOL_NEXT_MATCH',8,'participant_audio',jsonb_build_object('index',2,'role','name'),false,1),
    ('METEGOL_NEXT_MATCH',9,'fixed_audio',jsonb_build_object('logicalKey','and'),false,1),
    ('METEGOL_NEXT_MATCH',10,'participant_audio',jsonb_build_object('index',3,'role','name'),false,1),
    ('METEGOL_NEXT_MATCH',11,'fixed_audio',jsonb_build_object('logicalKey','metegol-call'),false,1),
    ('ROBLOX_PLAYERS_CALLED',1,'fixed_audio',jsonb_build_object('logicalKey','roblox-challenge'),false,1),
    ('ROBLOX_PLAYERS_CALLED',2,'fixed_audio',jsonb_build_object('logicalKey','roblox-players'),false,1),
    ('ROBLOX_PLAYERS_CALLED',3,'participant_audio',jsonb_build_object('index',0,'role','name'),false,1),
    ('ROBLOX_PLAYERS_CALLED',4,'participant_audio',jsonb_build_object('index',1,'role','name'),false,1),
    ('ROBLOX_PLAYERS_CALLED',5,'fixed_audio',jsonb_build_object('logicalKey','and'),false,1),
    ('ROBLOX_PLAYERS_CALLED',6,'participant_audio',jsonb_build_object('index',2,'role','name'),false,1),
    ('ROBLOX_PLAYERS_CALLED',7,'fixed_audio',jsonb_build_object('logicalKey','roblox-stations'),false,1),
    ('CHAMPION_CONFIRMED',1,'fixed_audio',jsonb_build_object('logicalKey','champion'),false,1),
    ('CHAMPION_CONFIRMED',2,'silence',jsonb_build_object('durationMs',220),true,0),
    ('CHAMPION_CONFIRMED',3,'participant_audio',jsonb_build_object('index',0,'role','name'),false,1),
    ('PLAYER_ACTIVATED',1,'participant_audio',jsonb_build_object('index',0,'role','welcome'),false,1),
    ('MISSION_BREACH',1,'fixed_audio',jsonb_build_object('logicalKey','anomaly-detected'),false,1),
    ('MISSION_BREACH',2,'silence',jsonb_build_object('durationMs',400),true,0),
    ('MISSION_BREACH',3,'fixed_audio',jsonb_build_object('logicalKey','glitch-mission-intro'),false,1),
    ('MISSION_WARNING_15',1,'fixed_audio',jsonb_build_object('logicalKey','glitch-15-minutes'),false,1),
    ('MISSION_WARNING_5',1,'fixed_audio',jsonb_build_object('logicalKey','glitch-5-minutes'),false,1),
    ('MISSION_WARNING_1',1,'fixed_audio',jsonb_build_object('logicalKey','glitch-1-minute'),false,1)
)
insert into public.announcement_segments(template_id,position,segment_type,config,optional,volume)
select t.id,s.position,s.segment_type,s.config,s.optional,s.volume
from segments s
join public.announcement_templates t on t.event_id='556ba287-bf5e-4b18-93b7-dd404f36092d'::uuid and t.template_key=s.template_key;
