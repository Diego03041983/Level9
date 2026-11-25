-- Demo-only data. Fixed IDs make the seed repeatable and easy to reset safely.
insert into public.events (id, name, subtitle, celebrant_name, celebrant_age, starts_at, ends_at, timezone, status, is_demo)
values ('10000000-0000-4000-8000-000000000001', 'Santiago Level 9', 'Gamer Party', 'Santiago', 9,
        '2026-11-29 19:00:00+00', '2026-11-29 22:00:00+00', 'America/Argentina/Cordoba', 'ready', true)
on conflict (id) do update set name = excluded.name, starts_at = excluded.starts_at, ends_at = excluded.ends_at;

insert into public.event_settings (event_id, theme, xp_rules, display_mode, auto_welcome)
values ('10000000-0000-4000-8000-000000000001',
        '{"background":"#080E24","cyan":"#00D9FF","lime":"#A3FF12","violet":"#A855F7","gold":"#FFCC00"}',
        '{"checkin":100,"participation":50,"win":50,"challenge":100,"mission":200}', 'mixed', true)
on conflict (event_id) do nothing;

insert into public.activities (id, event_id, slug, name, activity_type, status, rules) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','fifa','FIFA LEGENDS CUP','fifa','ready','{"format":"single_elimination","matchMinutes":6}'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','roblox','ROBLOX QUEST ARENA','roblox','ready','{"stations":3}'),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','metegol','METEGOL DUO CUP','foosball','ready','{"teamSize":2,"goalsToWin":5}'),
('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','mission','MISIÓN ROBUX SECRETA','mission','ready','{"teamSizes":[4,4,3,3]}')
on conflict (id) do nothing;

insert into public.stations (id, event_id, code, name, station_type, capacity) values
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','PS-01','PlayStation 01','playstation',2),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','PC-01','PC Gaming 01','pc',1),
('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','PC-02','PC Gaming 02','pc',1),
('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','PC-03','PC Gaming 03','pc',1),
('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','MET-01','Metegol 01','foosball',4)
on conflict (id) do nothing;

insert into public.participants (id, event_id, first_name, gamer_tag, player_number, avatar_key, is_celebrant, administrative_status, operational_status, arrived_at, is_demo) values
('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Santiago','SantiX',1,'cyber-fox',true,'active','available',now(),true),
('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Mateo','MatiPro',2,'pixel-wolf',false,'active','available',now(),true),
('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Benjamín','BenjaCraft',3,'neon-bear',false,'active','available',now(),true),
('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Felipe','FeliGoal',4,'turbo-cat',false,'active','available',now(),true),
('40000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','Joaquín','Joaco99',5,'plasma-panda',false,'active','available',now(),true),
('40000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','Tomás','TomiBlock',6,'laser-lion',false,'active','available',now(),true),
('40000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','Franco','FranByte',7,'cyber-shark',false,'active','available',now(),true),
('40000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000001','Valentín','ValenGG',8,'pixel-eagle',false,'active','available',now(),true),
('40000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001','Thiago','ThiagoPlay',9,'neon-koala',false,'active','available',now(),true),
('40000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','Lautaro','LautiWin',10,'turbo-tiger',false,'active','available',now(),true),
('40000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001','Bautista','BautiBoss',11,'plasma-owl',false,'active','available',now(),true),
('40000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000001','Lucas','LuquiDev',12,'laser-rabbit',false,'active','available',now(),true),
('40000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000001','Agustín','AguRush',13,'cyber-dragon',false,'active','available',now(),true),
('40000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000001','Simón','SimonMode',14,'pixel-monkey',false,'active','available',now(),true)
on conflict (id) do nothing;

insert into public.participant_consents (participant_id, photo_allowed, guardian_confirmation)
select p.id, false, null from public.participants p
where p.event_id = '10000000-0000-4000-8000-000000000001'
  and not exists (select 1 from public.participant_consents pc where pc.participant_id = p.id);

insert into public.participant_activity_preferences (participant_id, activity_id, enabled)
select p.id, a.id, true from public.participants p cross join public.activities a
where p.event_id = '10000000-0000-4000-8000-000000000001' and a.event_id = p.event_id
on conflict do nothing;

insert into public.schedule_items (id, event_id, title, starts_at, ends_at, position, scene_type) values
('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Recepción y registro','2026-11-29 19:00+00','2026-11-29 19:15+00',1,'WELCOME_SCREEN'),
('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Apertura de competencias','2026-11-29 19:15+00','2026-11-29 20:15+00',2,'EVENT_INTRO'),
('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Comida y descanso','2026-11-29 20:15+00','2026-11-29 20:35+00',3,'FOOD_BREAK'),
('50000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Continuación de actividades','2026-11-29 20:35+00','2026-11-29 21:00+00',4,'STATION_STATUS'),
('50000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','Misión Robux secreta','2026-11-29 21:00+00','2026-11-29 21:30+00',5,'MISSION_ALERT'),
('50000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','Finales','2026-11-29 21:30+00','2026-11-29 21:45+00',6,'TOURNAMENT_BRACKET'),
('50000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','Torta y premiación','2026-11-29 21:45+00','2026-11-29 22:00+00',7,'BIRTHDAY_CAKE')
on conflict (id) do nothing;

insert into public.achievements (event_id, code, name) values
('10000000-0000-4000-8000-000000000001','FIFA_LEGEND','FIFA LEGEND'),
('10000000-0000-4000-8000-000000000001','ROBLOX_MASTER','ROBLOX MASTER'),
('10000000-0000-4000-8000-000000000001','DUO_CHAMPION','DUO CHAMPION'),
('10000000-0000-4000-8000-000000000001','TREASURE_HUNTER','TREASURE HUNTER'),
('10000000-0000-4000-8000-000000000001','TEAM_PLAYER','TEAM PLAYER'),
('10000000-0000-4000-8000-000000000001','GAMER_LEVEL_9','GAMER LEVEL 9')
on conflict (event_id, code) do nothing;

insert into public.missions (id, event_id, name, story, secret_code_hash, duration_seconds, status)
values ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Misión Robux Secreta',
        'Glitch robó los Robux ficticios. Completen las pruebas para recuperar el código.', crypt('2909', gen_salt('bf')), 1800, 'ready')
on conflict (id) do nothing;

