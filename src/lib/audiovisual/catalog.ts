export type AudiovisualCategory = "event" | "players" | "competitions" | "roblox" | "mission";
export type PlayPolicy = "queue" | "interrupt" | "resume" | "discard_expired" | "replace_equivalent" | "confirm";

export interface AudiovisualEventDefinition {
  key: string;
  label: string;
  category: AudiovisualCategory;
  sceneType: string;
  templateKey: string;
  priority: number;
  policy: PlayPolicy;
  operational: boolean;
}

const event = (key:string,label:string,category:AudiovisualCategory,sceneType:string,priority:number,policy:PlayPolicy="queue",operational=false):AudiovisualEventDefinition=>({key,label,category,sceneType,templateKey:key,priority,policy,operational});

export const audiovisualEventCatalog = [
  event("EVENT_INFO","Información del evento","event","EVENT_INFO",40),
  event("EVENT_WELCOME","Bienvenida","event","WELCOME_SCREEN",40),
  event("EVENT_OPENING","Apertura oficial","event","EVENT_OPENING",70,"interrupt"),
  event("EVENT_BREAK","Descanso","event","EVENT_BREAK",70,"resume",true),
  event("EVENT_FOOD","Comida","event","EVENT_FOOD",70,"resume",true),
  event("EVENT_RESUME","Reanudación","event","EVENT_RESUME",70,"replace_equivalent",true),
  event("EVENT_CAKE","Momento de la torta","event","BIRTHDAY_CAKE",90,"interrupt",true),
  event("EVENT_AWARDS","Premiación","event","EVENT_AWARDS",80,"interrupt"),
  event("EVENT_CLOSING","Cierre","event","EVENT_CLOSING",90,"interrupt",true),
  event("PLAYER_ACTIVATED","Jugador activado","players","PLAYER_UNLOCKED",70,"replace_equivalent"),
  event("DRAW_STARTED","Inicio del sorteo","competitions","PLAYER_DRAW",60),
  event("DRAW_CONFIRMED","Sorteo confirmado","competitions","PLAYER_DRAW",60,"replace_equivalent"),
  event("MATCH_CALLED","Convocar próximo partido","competitions","VERSUS_SCREEN",70,"interrupt"),
  event("METEGOL_NEXT_MATCH","Convocar partido de metegol","competitions","DUO_VERSUS_SCREEN",70,"interrupt"),
  event("MATCH_STARTED","Iniciar partido","competitions","MATCH_COUNTDOWN",60,"interrupt"),
  event("MATCH_FINISHED","Resultado del partido","competitions","MATCH_RESULT",60,"interrupt"),
  event("WINNER_CONFIRMED","Ganador confirmado","competitions","MATCH_RESULT",70,"interrupt"),
  event("SEMIFINAL_ANNOUNCED","Semifinal","competitions","VERSUS_SCREEN",80,"interrupt"),
  event("FINAL_ANNOUNCED","Gran final","competitions","VERSUS_SCREEN",80,"interrupt"),
  event("CHAMPION_CONFIRMED","Campeón confirmado","competitions","CHAMPION_REVEAL",80,"interrupt"),
  event("ROBLOX_CHALLENGE_CREATED","Presentar desafío Roblox","roblox","ROBLOX_CHALLENGE",50),
  event("ROBLOX_PLAYERS_CALLED","Convocar jugadores Roblox","roblox","PLAYER_ROSTER",70,"interrupt"),
  event("ROBLOX_CHALLENGE_STARTED","Iniciar desafío Roblox","roblox","MATCH_COUNTDOWN",60,"interrupt",true),
  event("ROBLOX_TIME_WARNING","Advertencia Roblox","roblox","MISSION_ALERT",60,"interrupt"),
  event("ROBLOX_CHALLENGE_FINISHED","Finalizar desafío Roblox","roblox","MATCH_RESULT",60,"interrupt",true),
  event("ROBLOX_WINNER_CONFIRMED","Ganador Roblox","roblox","CHAMPION_REVEAL",70,"interrupt"),
  event("ROBLOX_ROTATION","Rotación Roblox","roblox","STATION_STATUS",50),
  event("MISSION_BREACH","Intervención de Glitch","mission","NEXUS_SYSTEM_BREACH",100,"interrupt",true),
  event("MISSION_TEAM_DRAW","Equipos de la misión","mission","TEAM_DRAW",100,"confirm",true),
  event("MISSION_STARTED","Iniciar misión","mission","MISSION_COUNTDOWN",100,"confirm",true),
  event("MISSION_WARNING","Advertencia de misión","mission","MISSION_ALERT",100,"interrupt"),
  event("MISSION_CLUE_UNLOCKED","Pista desbloqueada","mission","SECRET_CLUE",100,"interrupt"),
  event("MISSION_FINAL_CODE","Código final","mission","MISSION_FINAL_CODE",100,"interrupt"),
  event("MISSION_ACCESS_DENIED","Acceso denegado","mission","MISSION_ALERT",100,"interrupt"),
  event("MISSION_ACCESS_GRANTED","Acceso concedido","mission","ACCESS_GRANTED",100,"interrupt"),
  event("MISSION_COMPLETED","Tesoro recuperado","mission","TREASURE_UNLOCKED",100,"interrupt",true),
  event("MISSION_TIME_EXTENSION","Prórroga narrativa","mission","MISSION_ALERT",100,"interrupt",true),
  event("NEXUS_RESTORED","Nexus restaurado","mission","NEXUS_RESTORED",100,"interrupt",true),
] as const;

export const initialAudioCatalog = [
  ["event-info","Información del evento","event","Nexus-9"],
  ["event-welcome","Bienvenida","event","Nexus-9"],
  ["event-opening","Apertura oficial","event","Nexus-9"],
  ["event-break","Descanso","event","Nexus-9"],
  ["event-food","Comida","event","Nexus-9"],
  ["event-resume","Reanudación","event","Nexus-9"],
  ["event-cake","Torta","event","Nexus-9"],
  ["event-awards","Premiación","event","Nexus-9"],
  ["event-closing","Cierre","event","Nexus-9"],
  ["draw-start","Inicio de sorteo","competitions","Nexus-9"],
  ["draw-complete","Sorteo completo","competitions","Nexus-9"],
  ["fifa-next-match","Próximo partido FIFA","competitions","Nexus-9"],
  ["versus","Versus","competitions","Nexus-9"],
  ["and","Y","competitions","Nexus-9"],
  ["playstation-call","Convocatoria PlayStation","competitions","Nexus-9"],
  ["metegol-next-match","Próximo partido metegol","competitions","Nexus-9"],
  ["team-one","Equipo uno","competitions","Nexus-9"],
  ["team-two","Equipo dos","competitions","Nexus-9"],
  ["metegol-call","Convocatoria metegol","competitions","Nexus-9"],
  ["match-start","Inicio del partido","competitions","Nexus-9"],
  ["match-result","Resultado","competitions","Nexus-9"],
  ["winner-is","El ganador es","competitions","Nexus-9"],
  ["semifinal","Semifinal","competitions","Nexus-9"],
  ["grand-final","Gran final","competitions","Nexus-9"],
  ["champion","Campeón","competitions","Nexus-9"],
  ["roblox-challenge","Desafío Roblox","roblox","Nexus-9"],
  ["roblox-players","Jugadores Roblox","roblox","Nexus-9"],
  ["roblox-stations","Estaciones Roblox","roblox","Nexus-9"],
  ["roblox-start","Inicio Roblox","roblox","Nexus-9"],
  ["roblox-time-warning","Advertencia Roblox","roblox","Nexus-9"],
  ["roblox-finished","Final Roblox","roblox","Nexus-9"],
  ["roblox-winner","Ganador Roblox","roblox","Nexus-9"],
  ["roblox-rotation","Rotación Roblox","roblox","Nexus-9"],
  ["anomaly-detected","Anomalía detectada","mission","Glitch"],
  ["glitch-mission-intro","Introducción de Glitch","mission","Glitch"],
  ["glitch-team-draw","Equipos de misión","mission","Glitch"],
  ["glitch-mission-start","Inicio de misión","mission","Glitch"],
  ["glitch-15-minutes","Quedan 15 minutos","mission","Glitch"],
  ["glitch-5-minutes","Quedan 5 minutos","mission","Glitch"],
  ["glitch-1-minute","Queda 1 minuto","mission","Glitch"],
  ["glitch-clue-unlocked","Pista desbloqueada","mission","Glitch"],
  ["glitch-final-code","Código final","mission","Glitch"],
  ["glitch-time-extension","Prórroga","mission","Glitch"],
  ["access-denied","Acceso denegado","mission","Glitch"],
  ["access-granted","Acceso concedido","mission","Nexus-9"],
  ["system-restored","Sistema restaurado","mission","Nexus-9"],
] as const;

export const findEventDefinition=(key:string)=>audiovisualEventCatalog.find(item=>item.key===key);
