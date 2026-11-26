import type { SupabaseClient } from "@supabase/supabase-js";
import { findEventDefinition } from "./catalog";
import { buildAnnouncement } from "./engine";

type Context={participantIds:string[];title?:string;subtitle?:string;activity?:string;station?:string;round?:string;extra?:Record<string,string|number|boolean|null>};
type DispatchInput={eventId:string;eventKey:string;templateKey?:string;context:Context;rehearsal:boolean;confirm:boolean;targetDeviceId?:string|null;idempotencyKey:string;userId:string};
type AssetRelation={storage_path?:string};

const scenePolicy=(policy:string)=>policy==="interrupt"||policy==="replace_equivalent"?"force":policy==="resume"?"interrupt_lower":"queue";

async function applyOperationalMutation(supabase:SupabaseClient,input:DispatchInput){
  if(input.rehearsal)return;
  if(["EVENT_BREAK","EVENT_FOOD","EVENT_CAKE","MISSION_BREACH"].includes(input.eventKey)){
    await Promise.all([
      supabase.from("events").update({status:"paused"}).eq("id",input.eventId).eq("status","live"),
      supabase.from("activities").update({status:"paused"}).eq("event_id",input.eventId).eq("status","live"),
    ]);return;
  }
  if(input.eventKey==="EVENT_RESUME"){
    await Promise.all([
      supabase.from("events").update({status:"live"}).eq("id",input.eventId).eq("status","paused"),
      supabase.from("activities").update({status:"live"}).eq("event_id",input.eventId).eq("status","paused"),
    ]);return;
  }
  if(input.eventKey==="EVENT_CLOSING"){await supabase.from("events").update({status:"finished"}).eq("id",input.eventId);return}
  if(input.eventKey==="MISSION_STARTED"){
    const {data:mission}=await supabase.from("missions").select("id,status,started_at,paused_at,paused_seconds").eq("event_id",input.eventId).in("status",["ready","paused"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(mission)await supabase.from("missions").update({status:"live",started_at:mission.started_at??new Date().toISOString(),paused_at:null}).eq("id",mission.id);
    return;
  }
  if(input.eventKey==="MISSION_TIME_EXTENSION"){
    const seconds=typeof input.context.extra?.seconds==="number"?Math.max(60,Math.min(3600,input.context.extra.seconds)):300;
    const {data:mission}=await supabase.from("missions").select("id,extension_seconds").eq("event_id",input.eventId).in("status",["live","paused"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(mission)await supabase.from("missions").update({extension_seconds:Number(mission.extension_seconds??0)+seconds}).eq("id",mission.id);
    return;
  }
  if(input.eventKey==="MISSION_COMPLETED"||input.eventKey==="NEXUS_RESTORED"){
    await supabase.from("missions").update({status:"finished",completed_at:new Date().toISOString()}).eq("event_id",input.eventId).in("status",["live","paused","unlocked"]);
  }
}

export async function dispatchAudiovisualEvent(supabase:SupabaseClient,input:DispatchInput){
  const definition=findEventDefinition(input.eventKey);
  if(!definition)throw new Error("Evento audiovisual desconocido");
  const requiresConfirmation=definition.policy==="confirm"&&!input.confirm;
  const {data:eventRecord,error:eventError}=await supabase.from("audiovisual_events").insert({event_id:input.eventId,event_key:input.eventKey,payload:{context:input.context,templateKey:input.templateKey??definition.templateKey},priority:definition.priority,play_policy:definition.policy,status:requiresConfirmation?"awaiting_confirmation":"pending",rehearsal:input.rehearsal,idempotency_key:input.idempotencyKey,created_by:input.userId}).select("id,status").single();
  if(eventError||!eventRecord)throw eventError??new Error("No se pudo registrar el evento audiovisual");
  if(requiresConfirmation)return{eventId:eventRecord.id,awaitingConfirmation:true};

  const announcement=await buildAnnouncement(supabase,input.eventId,input.templateKey??definition.templateKey,input.context);
  if(definition.policy==="replace_equivalent"){
    const {data:older}=await supabase.from("audiovisual_events").select("scene_event_id").eq("event_id",input.eventId).eq("event_key",input.eventKey).in("status",["queued","playing"]).neq("id",eventRecord.id);
    const sceneIds=(older??[]).map(item=>item.scene_event_id).filter((id):id is string=>typeof id==="string");
    if(sceneIds.length)await supabase.from("scene_events").update({status:"expired"}).in("id",sceneIds);
    await supabase.from("audiovisual_events").update({status:"cancelled"}).eq("event_id",input.eventId).eq("event_key",input.eventKey).in("status",["queued","playing"]).neq("id",eventRecord.id);
  }
  let videoPath:string|undefined;
  if(input.eventKey==="MISSION_BREACH"){
    const {data:assignment}=await supabase.from("reception_media_assignments").select("media_assets(storage_path)").eq("event_id",input.eventId).eq("scene_key","NEXUS_SYSTEM_BREACH").eq("media_kind","video").is("participant_id",null).maybeSingle();
    const relation=assignment?.media_assets as unknown as AssetRelation|AssetRelation[]|null|undefined;
    videoPath=Array.isArray(relation)?relation[0]?.storage_path:relation?.storage_path;
  }
  const {data:players}=input.context.participantIds.length?await supabase.from("participants").select("id,first_name,last_name,gamer_tag,player_number,photo_path").eq("event_id",input.eventId).in("id",input.context.participantIds):{data:[]};
  const orderedPlayers=input.context.participantIds.map(id=>(players??[]).find(player=>player.id===id)).filter((player):player is NonNullable<typeof player>=>Boolean(player));
  const displayPlayers=orderedPlayers.map(player=>({name:player.first_name,gamerTag:player.gamer_tag,number:player.player_number,photoPath:player.photo_path}));
  const featuredPlayer=displayPlayers[0];
  const payload={eventKey:input.eventKey,title:input.context.title??definition.label,subtitle:input.context.subtitle,activity:input.context.activity,station:input.context.station,round:input.context.round,character:announcement.template.character_name,rehearsal:input.rehearsal,degraded:announcement.degraded,missingAudio:announcement.missing,players:displayPlayers,player:definition.sceneType==="PLAYER_UNLOCKED"?featuredPlayer:undefined,winner:["MATCH_RESULT","CHAMPION_REVEAL"].includes(definition.sceneType)?featuredPlayer:undefined,videoPath,state:input.eventKey==="MISSION_BREACH"?"NEXUS_SYSTEM_BREACH":undefined};
  const durationMs=Math.max(announcement.durationMs,videoPath?47_840:0,6000);
  const {data:scene,error:sceneError}=await supabase.from("scene_events").insert({event_id:input.eventId,scene_type:definition.sceneType,payload,priority:definition.priority,duration_ms:durationMs,sound:{sequence:announcement.sequence,totalDurationMs:announcement.durationMs},animation:{preset:input.eventKey.startsWith("MISSION_")?"glitch":"nexus",reducedMotionSafe:true},interrupt_policy:scenePolicy(definition.policy),status:"queued",target_device_id:input.targetDeviceId??null,idempotency_key:`av:${eventRecord.id}`,created_by:input.userId}).select("id").single();
  if(sceneError||!scene){await supabase.from("audiovisual_events").update({status:"failed",error_message:sceneError?.message??"No se pudo crear la escena"}).eq("id",eventRecord.id);throw sceneError??new Error("No se pudo crear la escena")}
  await supabase.from("audiovisual_events").update({status:"queued",scene_event_id:scene.id}).eq("id",eventRecord.id);
  if(definition.operational)await applyOperationalMutation(supabase,input);
  return{eventId:eventRecord.id,sceneId:scene.id,awaitingConfirmation:false,degraded:announcement.degraded,missing:announcement.missing,durationMs};
}
