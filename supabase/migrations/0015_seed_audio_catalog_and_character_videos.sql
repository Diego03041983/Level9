-- Register the production WAV catalog already uploaded for Santiago's event.
-- Character videos are shared visual beds; their embedded audio is muted by the TV.

with catalog(logical_key, category, character_name, duration_ms) as (
  values
    ('event-info','event','Nexus-9',20130),
    ('event-welcome','event','Nexus-9',22540),
    ('event-opening','event','Nexus-9',18700),
    ('event-break','event','Nexus-9',12480),
    ('event-food','event','Nexus-9',12650),
    ('event-resume','event','Nexus-9',10000),
    ('event-cake','event','Nexus-9',17550),
    ('event-awards','event','Nexus-9',18650),
    ('event-closing','event','Nexus-9',24950),
    ('draw-start','competitions','Nexus-9',9970),
    ('draw-complete','competitions','Nexus-9',4810),
    ('fifa-next-match','competitions','Nexus-9',5410),
    ('versus','competitions','Nexus-9',890),
    ('and','competitions','Nexus-9',1060),
    ('playstation-call','competitions','Nexus-9',6540),
    ('metegol-next-match','competitions','Nexus-9',6610),
    ('team-one','competitions','Nexus-9',2110),
    ('team-two','competitions','Nexus-9',1950),
    ('metegol-call','competitions','Nexus-9',6520),
    ('match-start','competitions','Nexus-9',8860),
    ('match-result','competitions','Nexus-9',8690),
    ('winner-is','competitions','Nexus-9',3660),
    ('semifinal','competitions','Nexus-9',11530),
    ('grand-final','competitions','Nexus-9',14080),
    ('champion','competitions','Nexus-9',9460),
    ('roblox-challenge','roblox','Nexus-9',10250),
    ('roblox-players','roblox','Nexus-9',3710),
    ('roblox-stations','roblox','Nexus-9',6300),
    ('roblox-start','roblox','Nexus-9',11770),
    ('roblox-time-warning','roblox','Nexus-9',7860),
    ('roblox-finished','roblox','Nexus-9',8490),
    ('roblox-winner','roblox','Nexus-9',6580),
    ('roblox-rotation','roblox','Nexus-9',11450),
    ('anomaly-detected','mission','Glitch',47840),
    ('glitch-team-draw','mission','Glitch',22610),
    ('glitch-mission-start','mission','Glitch',26290),
    ('glitch-15-minutes','mission','Glitch',13630),
    ('glitch-5-minutes','mission','Glitch',15460),
    ('glitch-clue-unlocked','mission','Glitch',16560),
    ('glitch-final-code','mission','Glitch',27050),
    ('glitch-time-extension','mission','Glitch',19850),
    ('system-restored','mission','Nexus-9',44250)
)
insert into public.media_assets(event_id,name,asset_type,storage_path,mime_type,metadata,logical_key,category,character_name,status,default_volume)
select
  '556ba287-bf5e-4b18-93b7-dd404f36092d'::uuid,
  initcap(replace(c.logical_key,'-',' ')),
  'audio',
  '556ba287-bf5e-4b18-93b7-dd404f36092d/library/catalog-audio/' || c.logical_key || '.wav',
  'audio/wav',
  jsonb_build_object('durationMs',c.duration_ms,'source','local-audio-catalog'),
  c.logical_key,c.category,c.character_name,'active',1
from catalog c
where not exists (
  select 1 from public.media_assets m
  where m.event_id='556ba287-bf5e-4b18-93b7-dd404f36092d'::uuid
    and m.logical_key=c.logical_key and m.status <> 'archived'
);

update public.media_assets
set logical_key='character-nexus-video', category='videos', character_name='Nexus-9', updated_at=now()
where id='782f075b-27e4-4abf-a59e-4e0b7dca3b2c'::uuid and logical_key is null;

update public.media_assets
set logical_key='character-glitch-video', category='videos', character_name='Glitch', updated_at=now()
where id='6627d8ce-6a8c-47dc-8cda-4fe4c6e0561c'::uuid and logical_key is null;
