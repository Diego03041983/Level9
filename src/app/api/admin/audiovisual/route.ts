import { NextRequest } from "next/server";
import { adminErrorResponse, AdminApiError, requireAdminEvent } from "@/lib/admin/server";
import { audiovisualEventCatalog } from "@/lib/audiovisual/catalog";
import { dispatchAudiovisualEvent } from "@/lib/audiovisual/dispatch";
import { ensureAudiovisualDefaults, mediaReadiness } from "@/lib/audiovisual/engine";
import { triggerAudiovisualSchema } from "@/lib/audiovisual/schemas";

export async function GET(request:NextRequest){
  try{
    const {supabase,event,userId}=await requireAdminEvent(request.nextUrl.searchParams.get("eventId")??undefined);
    await ensureAudiovisualDefaults(supabase,event.id,userId);
    const [{data:templates,error:templateError},{data:assets,error:assetError},{data:events},{data:players},{data:voices},{data:settings}]=await Promise.all([
      supabase.from("announcement_templates").select("id,template_key,name,category,character_name,trigger_event,scene_type,priority,play_policy,post_scene_type,enabled,is_default,announcement_segments(id,position,segment_type,config,optional,volume)").eq("event_id",event.id).order("category").order("name"),
      supabase.from("media_assets").select("id,name,logical_key,asset_type,storage_path,mime_type,metadata,category,character_name,status,default_volume,updated_at").eq("event_id",event.id).order("category").order("name"),
      supabase.from("audiovisual_events").select("id,event_key,priority,play_policy,status,rehearsal,scene_event_id,error_message,created_at").eq("event_id",event.id).order("created_at",{ascending:false}).limit(50),
      supabase.from("participants").select("id,first_name,last_name,gamer_tag,player_number,administrative_status,operational_status,photo_path").eq("event_id",event.id).order("player_number"),
      supabase.from("participant_audio_assets").select("id,participant_id,audio_role,status,media_asset_id,media_assets(id,name,storage_path,mime_type,metadata)").eq("event_id",event.id),
      supabase.from("event_settings").select("audiovisual").eq("event_id",event.id).maybeSingle(),
    ]);
    if(templateError||assetError)throw new AdminApiError(500,"READ_FAILED","No se pudo cargar el motor audiovisual");
    const assetRows=assets??[];
    const paths=assetRows.map(asset=>asset.storage_path);
    const {data:signed}=paths.length?await supabase.storage.from("event-media").createSignedUrls(paths,60*20):{data:[]};
    const assetsWithPreview=assetRows.map((asset,index)=>({...asset,preview_url:signed?.[index]?.signedUrl??null}));
    return Response.json({event,catalog:audiovisualEventCatalog,templates,assets:assetsWithPreview,events,players,voices,settings:settings?.audiovisual??{},readiness:mediaReadiness(assetRows as never[])},{headers:{"cache-control":"no-store"}});
  }catch(error){return adminErrorResponse(error)}
}

export async function POST(request:Request){
  try{
    const parsed=triggerAudiovisualSchema.safeParse(await request.json().catch(()=>null));
    if(!parsed.success)return Response.json({error:parsed.error.issues[0]?.message??"Solicitud inválida"},{status:400});
    const {supabase,event,userId}=await requireAdminEvent(parsed.data.eventId);
    const result=await dispatchAudiovisualEvent(supabase,{...parsed.data,eventId:event.id,userId,idempotencyKey:parsed.data.idempotencyKey??`${parsed.data.rehearsal?"rehearsal":"live"}:${parsed.data.eventKey}:${crypto.randomUUID()}`});
    return Response.json(result,{status:result.awaitingConfirmation?202:201});
  }catch(error){return adminErrorResponse(error)}
}

export async function PATCH(request:Request){
  try{
    const body=await request.json().catch(()=>null) as {eventId?:unknown;audiovisual?:unknown}|null;
    if(!body||typeof body.eventId!=="string"||!body.audiovisual||typeof body.audiovisual!=="object"||Array.isArray(body.audiovisual))return Response.json({error:"Configuración inválida"},{status:400});
    const{supabase,event}=await requireAdminEvent(body.eventId);
    const config=body.audiovisual as Record<string,unknown>;const gap=typeof config.defaultGapMs==="number"?Math.max(0,Math.min(2000,Math.round(config.defaultGapMs))):160;const priorities=config.priorities&&typeof config.priorities==="object"&&!Array.isArray(config.priorities)?Object.fromEntries(Object.entries(config.priorities as Record<string,unknown>).map(([key,value])=>[key,Math.max(0,Math.min(100,Number(value)||0))])):{};
    const audiovisual={priorities,defaultGapMs:gap,ducking:config.ducking!==false,automaticWarnings:config.automaticWarnings!==false};
    const{error}=await supabase.from("event_settings").update({audiovisual}).eq("event_id",event.id);if(error)throw new AdminApiError(409,"UPDATE_FAILED","No se pudo guardar la configuración");return Response.json({audiovisual});
  }catch(error){return adminErrorResponse(error)}
}
