import {NextRequest} from "next/server";
import {z} from "zod";
import {adminErrorResponse,AdminApiError,requireAdminEvent} from "@/lib/admin/server";
import {dispatchAudiovisualEvent} from "@/lib/audiovisual/dispatch";

const operationSchema=z.discriminatedUnion("operation",[
  z.object({operation:z.literal("configure"),eventId:z.uuid(),name:z.string().min(2).max(120),story:z.string().max(2000).default(""),code:z.string().regex(/^\d{4}$/),durationSeconds:z.number().int().min(300).max(10800)}),
  z.object({operation:z.enum(["pause","resume","tick","complete","reset"]),eventId:z.uuid(),missionId:z.uuid()}),
  z.object({operation:z.literal("extend"),eventId:z.uuid(),missionId:z.uuid(),seconds:z.number().int().min(60).max(3600)}),
  z.object({operation:z.literal("assignTeam"),eventId:z.uuid(),missionId:z.uuid(),slot:z.number().int().min(1).max(4),memberIds:z.array(z.uuid()).max(20)}),
  z.object({operation:z.literal("revealDigit"),eventId:z.uuid(),missionId:z.uuid(),slot:z.number().int().min(1).max(4),digit:z.string().regex(/^\d$/)}),
  z.object({operation:z.literal("playClue"),eventId:z.uuid(),missionId:z.uuid(),assetId:z.uuid()}),
]);
type Mission={id:string;name:string;story:string|null;duration_seconds:number|null;status:string;started_at:string|null;paused_at:string|null;paused_seconds:number;extension_seconds:number;warnings_sent:Record<string,boolean>;unlocked_at:string|null;completed_at:string|null};

const timing=(mission:Mission,now=Date.now())=>{const duration=(mission.duration_seconds??1800)+mission.extension_seconds;if(!mission.started_at)return{durationSeconds:duration,remainingSeconds:duration,elapsedSeconds:0};const endpoint=mission.status==="paused"&&mission.paused_at?Date.parse(mission.paused_at):mission.unlocked_at?Date.parse(mission.unlocked_at):mission.completed_at?Date.parse(mission.completed_at):now;const elapsed=Math.max(0,Math.floor((endpoint-Date.parse(mission.started_at))/1000)-mission.paused_seconds);return{durationSeconds:duration,remainingSeconds:Math.max(0,duration-elapsed),elapsedSeconds:elapsed}};

export async function GET(request:NextRequest){try{const{supabase,event}=await requireAdminEvent(request.nextUrl.searchParams.get("eventId")??undefined);const{data,error}=await supabase.from("missions").select("id,name,story,duration_seconds,status,started_at,paused_at,paused_seconds,extension_seconds,warnings_sent,unlocked_at,completed_at").eq("event_id",event.id).order("created_at",{ascending:false}).limit(1).maybeSingle();if(error)throw new AdminApiError(500,"READ_FAILED","No se pudo cargar la misión");const mission=data as unknown as Mission|null;const [slots,participants,members,clues]=await Promise.all([mission?supabase.from("mission_digit_slots").select("slot,team_id,digit").eq("mission_id",mission.id):Promise.resolve({data:[]}),supabase.from("participants").select("id,first_name,last_name,gamer_tag,player_number").eq("event_id",event.id).eq("administrative_status","active").eq("registration_status","ACTIVATED").order("player_number"),supabase.from("team_members").select("team_id,participant_id"),supabase.from("media_assets").select("id,name,logical_key,metadata").eq("event_id",event.id).eq("status","active").eq("asset_type","audio").like("logical_key","mission-clue-%").order("name")]);return Response.json({mission:mission?{...mission,...timing(mission)}:null,slots:slots.data??[],participants:participants.data??[],members:members.data??[],clues:clues.data??[],serverTime:new Date().toISOString()},{headers:{"cache-control":"no-store"}})}catch(error){return adminErrorResponse(error)}}

export async function POST(request:Request){try{const parsed=operationSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:parsed.error.issues[0]?.message},{status:400});const{supabase,event,userId}=await requireAdminEvent(parsed.data.eventId);if(parsed.data.operation==="configure"){const{data,error}=await supabase.rpc("configure_level9_mission",{p_event_id:event.id,p_name:parsed.data.name,p_story:parsed.data.story,p_secret_code:parsed.data.code,p_duration_seconds:parsed.data.durationSeconds});if(error)throw new AdminApiError(409,"CONFIGURE_FAILED","No se pudo configurar la misión");return Response.json({missionId:data})}
const{data:rawMission}=await supabase.from("missions").select("id,name,story,duration_seconds,status,started_at,paused_at,paused_seconds,extension_seconds,warnings_sent,unlocked_at,completed_at").eq("id",parsed.data.missionId).eq("event_id",event.id).maybeSingle();if(!rawMission)throw new AdminApiError(404,"NOT_FOUND","Misión inexistente");const mission=rawMission as unknown as Mission;
if(parsed.data.operation==="reset"){
 const{error}=await supabase.rpc("reset_level9_mission_run",{p_event_id:event.id,p_mission_id:mission.id});
 if(error)throw new AdminApiError(409,"RESET_FAILED","No se pudo reiniciar la misión: "+error.message);
 return Response.json({reset:true});
}
if(parsed.data.operation==="pause"){if(mission.status!=="live")throw new AdminApiError(409,"INVALID_STATE","La misión no está activa");await supabase.from("missions").update({status:"paused",paused_at:new Date().toISOString()}).eq("id",mission.id);return Response.json({paused:true})}
if(parsed.data.operation==="resume"){if(mission.status!=="paused"||!mission.paused_at)throw new AdminApiError(409,"INVALID_STATE","La misión no está pausada");const added=Math.max(0,Math.floor((Date.now()-Date.parse(mission.paused_at))/1000));await supabase.from("missions").update({status:"live",paused_at:null,paused_seconds:mission.paused_seconds+added}).eq("id",mission.id);return Response.json({resumed:true})}
if(parsed.data.operation==="extend"){await supabase.from("missions").update({extension_seconds:mission.extension_seconds+parsed.data.seconds}).eq("id",mission.id);await dispatchAudiovisualEvent(supabase,{eventId:event.id,eventKey:"MISSION_TIME_EXTENSION",context:{participantIds:[],extra:{seconds:parsed.data.seconds}},rehearsal:false,confirm:true,idempotencyKey:`mission:${mission.id}:extension:${mission.extension_seconds+parsed.data.seconds}`,userId});return Response.json({extended:true})}
if(parsed.data.operation==="assignTeam"){
 if(!["ready","draft"].includes(mission.status))throw new AdminApiError(409,"INVALID_STATE","Los equipos solo se pueden modificar antes de iniciar la misión");
 if(parsed.data.memberIds.length){const{data:players,error:playersError}=await supabase.from("participants").select("id").eq("event_id",event.id).eq("administrative_status","active").eq("registration_status","ACTIVATED").in("id",parsed.data.memberIds);if(playersError||players?.length!==new Set(parsed.data.memberIds).size)throw new AdminApiError(400,"INACTIVE_PLAYER","Solo se pueden asignar jugadores activados de este evento")}
 const{data,error}=await supabase.rpc("assign_mission_team",{p_event_id:event.id,p_mission_id:mission.id,p_slot:parsed.data.slot,p_member_ids:parsed.data.memberIds});
 if(error){const message=error.message.includes("player already in another mission team")?"Un jugador ya está en otro equipo. Quitalo del equipo anterior antes de asignarlo aquí.":error.message.includes("invalid player")?"Hay un jugador que no pertenece a este evento.":"No se pudo guardar el equipo: "+error.message;throw new AdminApiError(409,"TEAM_FAILED",message)}
 return Response.json({teamId:data});
}
if(parsed.data.operation==="playClue"){
 if(!["live","paused"].includes(mission.status))throw new AdminApiError(409,"INVALID_STATE","La misión no está en curso");
 const{data:asset}=await supabase.from("media_assets").select("id,name,storage_path,logical_key,metadata").eq("id",parsed.data.assetId).eq("event_id",event.id).eq("status","active").eq("asset_type","audio").maybeSingle();
 if(!asset?.logical_key?.startsWith("mission-clue-"))throw new AdminApiError(404,"NOT_FOUND","Audio de pista no disponible");
 const duration=typeof asset.metadata==="object"&&asset.metadata&&"durationMs" in asset.metadata?Number(asset.metadata.durationMs):0;
 const{data:glitchVideo}=await supabase.from("media_assets").select("storage_path").eq("event_id",event.id).eq("logical_key","character-glitch-video").eq("status","active").maybeSingle();
 if(!glitchVideo?.storage_path)throw new AdminApiError(409,"GLITCH_VISUAL_MISSING","Falta el video de Glitch para acompañar la pista");
 const{error:videoError}=await supabase.storage.from("event-media").info(glitchVideo.storage_path);
 if(videoError)throw new AdminApiError(409,"GLITCH_VISUAL_MISSING","El video de Glitch no está disponible para la TV");
 const{error}=await supabase.from("scene_events").insert({event_id:event.id,scene_type:"MISSION_CLUE",payload:{title:asset.name,eventKey:"MISSION_CLUE_AUDIO",character:"Glitch",videoPath:glitchVideo.storage_path,videoLoop:true,audioBoundVideo:true},priority:100,duration_ms:Math.max(6000,Math.min(300000,duration||6000)),sound:{path:asset.storage_path,volume:1},animation:{preset:"glitch"},interrupt_policy:"force",status:"queued",idempotency_key:`mission:${mission.id}:clue:${asset.id}:${crypto.randomUUID()}`,created_by:userId});
 if(error)throw new AdminApiError(500,"SCENE_FAILED","No se pudo enviar la pista");
 return Response.json({sent:true});
}
if(parsed.data.operation==="revealDigit"){
 const{count:revealedCount,error:countError}=await supabase.from("mission_digit_slots").select("slot",{count:"exact",head:true}).eq("mission_id",mission.id).not("digit","is",null);
 if(countError)throw new AdminApiError(500,"DIGIT_READ_FAILED","No se pudo comprobar el estado del código");
 if(revealedCount===3){
  const{data:finalVideo,error:videoLookupError}=await supabase.from("media_assets").select("storage_path").eq("event_id",event.id).eq("logical_key","glitch-defeat-video").eq("asset_type","video").eq("status","active").maybeSingle();
  if(videoLookupError||!finalVideo?.storage_path)throw new AdminApiError(409,"FINAL_VIDEO_MISSING","Falta el video final de Glitch. No se desbloqueó el último dígito");
  const{error:fileError}=await supabase.storage.from("event-media").info(finalVideo.storage_path);
  if(fileError)throw new AdminApiError(409,"FINAL_VIDEO_MISSING","El video final de Glitch no está disponible. No se desbloqueó el último dígito");
 }
 const{data:completed,error}=await supabase.rpc("reveal_mission_digit",{p_event_id:event.id,p_mission_id:mission.id,p_slot:parsed.data.slot,p_digit:parsed.data.digit});
 if(error)throw new AdminApiError(409,"DIGIT_FAILED",error.message);
 if(completed){const{error:expireError}=await supabase.from("scene_events").update({status:"expired"}).eq("event_id",event.id).in("status",["queued","delivered","playing"]).neq("scene_type","GLITCH_DEFEATED");if(expireError)console.error("Mission completed but old scenes could not be expired",expireError)}
 return Response.json({completed:Boolean(completed)});
}
if(parsed.data.operation==="complete"){await dispatchAudiovisualEvent(supabase,{eventId:event.id,eventKey:"MISSION_COMPLETED",context:{participantIds:[],title:"TESORO RECUPERADO"},rehearsal:false,confirm:true,idempotencyKey:`mission:${mission.id}:manual-complete`,userId});await dispatchAudiovisualEvent(supabase,{eventId:event.id,eventKey:"NEXUS_RESTORED",context:{participantIds:[],title:"NEXUS RESTAURADO"},rehearsal:false,confirm:true,idempotencyKey:`mission:${mission.id}:restored`,userId});return Response.json({completed:true})}
const state=timing(mission);const warning=state.remainingSeconds<=60?"1":state.remainingSeconds<=300?"5":state.remainingSeconds<=900?"15":null;if(warning&&!mission.warnings_sent?.[warning]&&mission.status==="live"){const warnings={...(mission.warnings_sent??{}),[warning]:true};const{error:updateError}=await supabase.from("missions").update({warnings_sent:warnings}).eq("id",mission.id);if(!updateError)await dispatchAudiovisualEvent(supabase,{eventId:event.id,eventKey:"MISSION_WARNING",templateKey:`MISSION_WARNING_${warning}`,context:{participantIds:[],title:`QUEDAN ${warning} MINUTOS`,extra:{remainingSeconds:state.remainingSeconds}},rehearsal:false,confirm:true,idempotencyKey:`mission:${mission.id}:warning:${warning}`,userId})}return Response.json({...state,warningTriggered:warning})
}catch(error){return adminErrorResponse(error)}}
