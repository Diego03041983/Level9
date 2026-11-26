import type { SupabaseClient } from "@supabase/supabase-js";
import { audiovisualEventCatalog, initialAudioCatalog, type AudiovisualCategory, type PlayPolicy } from "./catalog";

type SegmentKind="fixed_audio"|"participant_audio"|"silence"|"effect"|"music";
type SegmentSeed={type:SegmentKind;config:Record<string,unknown>;optional?:boolean;volume?:number};
type TemplateSeed={key:string;name:string;category:AudiovisualCategory;character:string;sceneType:string;priority:number;policy:PlayPolicy;segments:SegmentSeed[]};
type Context={participantIds:string[];title?:string;subtitle?:string;activity?:string;station?:string;round?:string;extra?:Record<string,string|number|boolean|null>};
type MediaRow={id:string;logical_key:string|null;storage_path:string;default_volume:number;metadata:unknown;status:string};
type ParticipantAudioRow={participant_id:string;audio_role:string;status:string;media_assets:MediaRow|MediaRow[]|null};
type TemplateRow={id:string;template_key:string;name:string;scene_type:string;priority:number;play_policy:PlayPolicy;character_name:string;post_scene_type:string|null};
type SegmentRow={position:number;segment_type:SegmentKind;config:Record<string,unknown>;optional:boolean;volume:number};

const fixed=(logicalKey:string,optional=false):SegmentSeed=>({type:"fixed_audio",config:{logicalKey},optional});
const player=(index:number,role="name"):SegmentSeed=>({type:"participant_audio",config:{index,role}});
const gap=(durationMs=160):SegmentSeed=>({type:"silence",config:{durationMs},optional:true});

const dynamicTemplates:TemplateSeed[]=[
  {key:"MATCH_CALLED",name:"Próximo partido FIFA",category:"competitions",character:"Nexus-9",sceneType:"VERSUS_SCREEN",priority:50,policy:"queue",segments:[fixed("fifa-next-match"),gap(),player(0),gap(),fixed("versus"),gap(),player(1),gap(),fixed("playstation-call")]},
  {key:"METEGOL_NEXT_MATCH",name:"Próximo partido de metegol",category:"competitions",character:"Nexus-9",sceneType:"DUO_VERSUS_SCREEN",priority:50,policy:"queue",segments:[fixed("metegol-next-match"),gap(),fixed("team-one"),gap(),player(0),gap(),fixed("and"),gap(),player(1),gap(),fixed("versus"),gap(),fixed("team-two"),gap(),player(2),gap(),fixed("and"),gap(),player(3),gap(),fixed("metegol-call")]},
  {key:"ROBLOX_PLAYERS_CALLED",name:"Convocatoria Roblox",category:"roblox",character:"Nexus-9",sceneType:"PLAYER_ROSTER",priority:50,policy:"queue",segments:[fixed("roblox-challenge"),gap(),fixed("roblox-players"),gap(),player(0),gap(),player(1),gap(),fixed("and"),gap(),player(2),gap(),fixed("roblox-stations")]},
  {key:"CHAMPION_CONFIRMED",name:"Presentación del campeón",category:"competitions",character:"Nexus-9",sceneType:"CHAMPION_REVEAL",priority:80,policy:"interrupt",segments:[fixed("champion"),gap(220),player(0)]},
  {key:"PLAYER_ACTIVATED",name:"Jugador desbloqueado",category:"players",character:"Nexus-9",sceneType:"PLAYER_UNLOCKED",priority:70,policy:"replace_equivalent",segments:[{type:"participant_audio",config:{index:0,role:"welcome"}}]},
  {key:"MISSION_WARNING_15",name:"Advertencia · 15 minutos",category:"mission",character:"Glitch",sceneType:"MISSION_ALERT",priority:100,policy:"interrupt",segments:[fixed("glitch-15-minutes")]},
  {key:"MISSION_WARNING_5",name:"Advertencia · 5 minutos",category:"mission",character:"Glitch",sceneType:"MISSION_ALERT",priority:100,policy:"interrupt",segments:[fixed("glitch-5-minutes")]},
  {key:"MISSION_WARNING_1",name:"Advertencia · 1 minuto",category:"mission",character:"Glitch",sceneType:"MISSION_ALERT",priority:100,policy:"interrupt",segments:[fixed("glitch-1-minute")]},
];

const audioKeyForEvent:Record<string,string>={
  EVENT_INFO:"event-info",EVENT_WELCOME:"event-welcome",EVENT_OPENING:"event-opening",EVENT_BREAK:"event-break",EVENT_FOOD:"event-food",EVENT_RESUME:"event-resume",EVENT_CAKE:"event-cake",EVENT_AWARDS:"event-awards",EVENT_CLOSING:"event-closing",
  DRAW_STARTED:"draw-start",DRAW_CONFIRMED:"draw-complete",MATCH_STARTED:"match-start",MATCH_FINISHED:"match-result",WINNER_CONFIRMED:"winner-is",SEMIFINAL_ANNOUNCED:"semifinal",FINAL_ANNOUNCED:"grand-final",
  ROBLOX_CHALLENGE_CREATED:"roblox-challenge",ROBLOX_CHALLENGE_STARTED:"roblox-start",ROBLOX_TIME_WARNING:"roblox-time-warning",ROBLOX_CHALLENGE_FINISHED:"roblox-finished",ROBLOX_WINNER_CONFIRMED:"roblox-winner",ROBLOX_ROTATION:"roblox-rotation",
  MISSION_BREACH:"anomaly-detected",MISSION_TEAM_DRAW:"glitch-team-draw",MISSION_STARTED:"glitch-mission-start",MISSION_WARNING:"glitch-5-minutes",MISSION_CLUE_UNLOCKED:"glitch-clue-unlocked",MISSION_FINAL_CODE:"glitch-final-code",MISSION_ACCESS_DENIED:"access-denied",MISSION_ACCESS_GRANTED:"access-granted",MISSION_COMPLETED:"access-granted",MISSION_TIME_EXTENSION:"glitch-time-extension",NEXUS_RESTORED:"system-restored",
};

const defaultTemplates:TemplateSeed[]=[...audiovisualEventCatalog.map(definition=>({
  key:definition.templateKey,name:definition.label,category:definition.category,character:definition.category==="mission"&&definition.key!=="NEXUS_RESTORED"?"Glitch":"Nexus-9",sceneType:definition.sceneType,priority:definition.priority,policy:definition.policy,
  segments:audioKeyForEvent[definition.key]?[fixed(audioKeyForEvent[definition.key])]:[],
})),...dynamicTemplates].filter((template,index,all)=>all.findIndex(item=>item.key===template.key)===index);

const durationFromMetadata=(metadata:unknown)=>{
  if(!metadata||typeof metadata!=="object"||Array.isArray(metadata))return 0;
  const value=(metadata as Record<string,unknown>).durationMs;
  return typeof value==="number"&&Number.isFinite(value)?Math.max(0,value):0;
};

export async function ensureAudiovisualDefaults(supabase:SupabaseClient,eventId:string,userId?:string){
  const {data:existing,error}=await supabase.from("announcement_templates").select("id,template_key").eq("event_id",eventId);
  if(error)throw error;
  const existingKeys=new Set((existing??[]).map(row=>String(row.template_key)));
  for(const template of defaultTemplates){
    if(existingKeys.has(template.key))continue;
    const {data:created,error:createError}=await supabase.from("announcement_templates").insert({event_id:eventId,template_key:template.key,name:template.name,category:template.category,character_name:template.character,trigger_event:template.key,scene_type:template.sceneType,priority:template.priority,play_policy:template.policy,is_default:true}).select("id").single();
    if(createError||!created)throw createError??new Error("No se pudo crear la plantilla audiovisual");
    if(template.segments.length){
      const {error:segmentError}=await supabase.from("announcement_segments").insert(template.segments.map((segment,index)=>({template_id:created.id,position:index+1,segment_type:segment.type,config:segment.config,optional:segment.optional??false,volume:segment.volume??1})));
      if(segmentError)throw segmentError;
    }
  }

  // Existing private assets are catalogued by logical key without copying bytes.
  const {data:assets}=await supabase.from("media_assets").select("id,name,storage_path,logical_key,metadata").eq("event_id",eventId);
  const byPath=new Map((assets??[]).map(asset=>[String(asset.storage_path),asset]));
  const {data:receptionMedia}=await supabase.from("reception_media_assignments").select("scene_key,media_kind,participant_id,media_asset_id,media_assets(storage_path)").eq("event_id",eventId).is("participant_id",null);
  for(const assignment of receptionMedia??[]){
    const relation=assignment.media_assets as unknown as {storage_path?:string}|{storage_path?:string}[]|null;
    const path=Array.isArray(relation)?relation[0]?.storage_path:relation?.storage_path;
    if(!path)continue;
    const asset=byPath.get(path);if(!asset||asset.logical_key)continue;
    const sceneKey=String(assignment.scene_key);
    const logicalKey=sceneKey==="NEXUS_SYSTEM_BREACH"?"anomaly-detected":sceneKey.toLowerCase().replaceAll("_","-");
    await supabase.from("media_assets").update({logical_key:logicalKey,category:sceneKey.includes("GLITCH")||sceneKey.includes("BREACH")?"mission":"event",character_name:sceneKey.includes("GLITCH")||sceneKey.includes("BREACH")?"Glitch":"Nexus-9",updated_at:new Date().toISOString()}).eq("id",asset.id);
  }
  void userId;
}

export interface AnnouncementSequenceItem {kind:"audio"|"silence";path?:string;url?:string;durationMs:number;volume:number;label:string}
export interface BuiltAnnouncement {template:TemplateRow;sequence:AnnouncementSequenceItem[];durationMs:number;missing:string[];participantNames:string[];degraded:boolean}

export async function buildAnnouncement(supabase:SupabaseClient,eventId:string,templateKey:string,context:Context):Promise<BuiltAnnouncement>{
  await ensureAudiovisualDefaults(supabase,eventId);
  const {data:templateData,error:templateError}=await supabase.from("announcement_templates").select("id,template_key,name,scene_type,priority,play_policy,character_name,post_scene_type").eq("event_id",eventId).eq("template_key",templateKey).eq("enabled",true).maybeSingle();
  if(templateError||!templateData)throw templateError??new Error(`Plantilla ${templateKey} no disponible`);
  const template=templateData as unknown as TemplateRow;
  const [{data:segmentData,error:segmentError},{data:mediaData},{data:participantData},{data:voiceData}]=await Promise.all([
    supabase.from("announcement_segments").select("position,segment_type,config,optional,volume").eq("template_id",template.id).order("position"),
    supabase.from("media_assets").select("id,logical_key,storage_path,default_volume,metadata,status").eq("event_id",eventId).eq("status","active").not("logical_key","is",null),
    context.participantIds.length?supabase.from("participants").select("id,first_name,last_name,gamer_tag,player_number").eq("event_id",eventId).in("id",context.participantIds):Promise.resolve({data:[],error:null}),
    context.participantIds.length?supabase.from("participant_audio_assets").select("participant_id,audio_role,status,media_assets(id,logical_key,storage_path,default_volume,metadata,status)").eq("event_id",eventId).in("participant_id",context.participantIds).eq("status","active"):Promise.resolve({data:[],error:null}),
  ]);
  if(segmentError)throw segmentError;
  const segments=(segmentData??[]) as unknown as SegmentRow[];
  const media=new Map(((mediaData??[]) as unknown as MediaRow[]).map(asset=>[asset.logical_key,asset]));
  const participants=new Map((participantData??[]).map(item=>[String(item.id),item]));
  const voices=new Map<string,MediaRow>();
  for(const row of (voiceData??[]) as unknown as ParticipantAudioRow[]){const relation=Array.isArray(row.media_assets)?row.media_assets[0]:row.media_assets;if(relation)voices.set(`${row.participant_id}:${row.audio_role}`,relation)}
  const sequence:AnnouncementSequenceItem[]=[];const missing:string[]=[];
  for(const segment of segments){
    if(segment.segment_type==="silence"){
      const duration=typeof segment.config.durationMs==="number"?Math.max(0,Math.min(5000,segment.config.durationMs)):160;
      sequence.push({kind:"silence",durationMs:duration,volume:0,label:"Pausa"});continue;
    }
    let asset:MediaRow|undefined;let label="";
    if(segment.segment_type==="participant_audio"){
      const index=typeof segment.config.index==="number"?segment.config.index:0;const role=typeof segment.config.role==="string"?segment.config.role:"name";const participantId=context.participantIds[index];const participant=participantId?participants.get(participantId):undefined;
      label=participant?String(participant.gamer_tag||participant.first_name):`Jugador ${index+1}`;
      asset=participantId?voices.get(`${participantId}:${role}`):undefined;
      if(!asset)asset=media.get("player-generic");
    }else{
      const logicalKey=typeof segment.config.logicalKey==="string"?segment.config.logicalKey:"";label=logicalKey;asset=media.get(logicalKey);
    }
    if(!asset){if(!segment.optional)missing.push(label||`Segmento ${segment.position}`);continue}
    sequence.push({kind:"audio",path:asset.storage_path,durationMs:durationFromMetadata(asset.metadata),volume:Math.min(1,Math.max(0,Number(asset.default_volume??1)*Number(segment.volume??1))),label});
  }
  const participantNames=context.participantIds.map((id,index)=>{const item=participants.get(id);return item?String(item.gamer_tag||item.first_name):`Jugador ${index+1}`});
  const durationMs=Math.max(5000,sequence.reduce((total,item)=>total+(item.durationMs||2500),0)+750);
  return{template,sequence,durationMs,missing,participantNames,degraded:missing.length>0};
}

export function mediaReadiness(assets:MediaRow[]){
  const existing=new Set(assets.filter(asset=>asset.status==="active"&&asset.logical_key).map(asset=>asset.logical_key));
  const required=initialAudioCatalog.map(([key,name,category,character])=>({key,name,category,character,exists:existing.has(key)}));
  const ready=required.filter(item=>item.exists).length;
  return{required,ready,total:required.length,percentage:required.length?Math.round(ready/required.length*100):100};
}
