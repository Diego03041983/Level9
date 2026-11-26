import { NextRequest } from "next/server";
import { adminErrorResponse, AdminApiError, requireAdminEvent } from "@/lib/admin/server";
import { mediaRegistrationSchema, playerAudioSchema } from "@/lib/audiovisual/schemas";

const allowedSize=(mime:string)=>mime==="video/mp4"?100*1024*1024:20*1024*1024;

export async function POST(request:Request){
  try{
    const body=await request.json().catch(()=>null);
    if(body&&typeof body==="object"&&"participantId" in body){
      const parsed=playerAudioSchema.safeParse(body);if(!parsed.success)return Response.json({error:parsed.error.issues[0]?.message},{status:400});
      const {supabase,event}=await requireAdminEvent(parsed.data.eventId);
      const [{data:participant},{data:asset}]=await Promise.all([
        supabase.from("participants").select("id").eq("id",parsed.data.participantId).eq("event_id",event.id).maybeSingle(),
        supabase.from("media_assets").select("id,event_id,asset_type").eq("id",parsed.data.mediaAssetId).eq("event_id",event.id).maybeSingle(),
      ]);
      if(!participant||!asset||asset.asset_type!=="audio")throw new AdminApiError(404,"RESOURCE_NOT_FOUND","El jugador o el audio no pertenece al evento");
      const {error}=await supabase.from("participant_audio_assets").upsert({event_id:event.id,participant_id:participant.id,audio_role:parsed.data.role,media_asset_id:asset.id,status:"active"},{onConflict:"participant_id,audio_role"});
      if(error)throw new AdminApiError(409,"ASSIGNMENT_FAILED","No se pudo asociar el audio al jugador");
      return Response.json({ok:true});
    }
    const parsed=mediaRegistrationSchema.safeParse(body);if(!parsed.success)return Response.json({error:parsed.error.issues[0]?.message},{status:400});
    const {supabase,event,userId}=await requireAdminEvent(parsed.data.eventId);
    const prefix=`${event.id}/library/${parsed.data.category}/${parsed.data.logicalKey}/`;
    if(!parsed.data.storagePath.startsWith(prefix))throw new AdminApiError(400,"INVALID_PATH","La ruta del archivo no corresponde a la biblioteca");
    const {data:file,error:infoError}=await supabase.storage.from("event-media").info(parsed.data.storagePath);
    const size=Number(file?.size??file?.metadata?.size);const actualMime=file?.contentType??file?.metadata?.mimetype;
    if(infoError||!file||actualMime!==parsed.data.mimeType||!Number.isFinite(size)||size<=0||size>allowedSize(parsed.data.mimeType))throw new AdminApiError(400,"INVALID_FILE","El archivo no tiene un formato o tamaño permitido");
    const assetType=parsed.data.mimeType==="video/mp4"?"video":parsed.data.mimeType.startsWith("image/")?"image":"audio";
    const {data:previous}=await supabase.from("media_assets").select("id,storage_path").eq("event_id",event.id).eq("logical_key",parsed.data.logicalKey).neq("status","archived").maybeSingle();
    if(previous)throw new AdminApiError(409,"CONFIRM_REPLACE","El recurso ya existe. Eliminá o archivá la versión anterior antes de reemplazarla.");
    const {data:asset,error}=await supabase.from("media_assets").insert({event_id:event.id,name:parsed.data.name,logical_key:parsed.data.logicalKey,asset_type:assetType,storage_path:parsed.data.storagePath,mime_type:parsed.data.mimeType,metadata:{durationMs:parsed.data.durationMs,source:"audiovisual-library"},category:parsed.data.category,character_name:parsed.data.characterName??null,status:"active",default_volume:parsed.data.volume,created_by:userId}).select("id").single();
    if(error||!asset)throw new AdminApiError(409,"REGISTRATION_FAILED","No se pudo registrar el recurso");
    return Response.json({asset},{status:201});
  }catch(error){return adminErrorResponse(error)}
}

export async function DELETE(request:NextRequest){
  try{
    const eventId=request.nextUrl.searchParams.get("eventId")??"";const assetId=request.nextUrl.searchParams.get("assetId")??"";
    const {supabase,event}=await requireAdminEvent(eventId);
    const {data:asset}=await supabase.from("media_assets").select("id,storage_path").eq("id",assetId).eq("event_id",event.id).maybeSingle();
    if(!asset)throw new AdminApiError(404,"NOT_FOUND","Recurso inexistente");
    const {error}=await supabase.from("media_assets").delete().eq("id",asset.id).eq("event_id",event.id);if(error)throw new AdminApiError(409,"IN_USE","El recurso está asociado y no se puede eliminar");
    await supabase.storage.from("event-media").remove([asset.storage_path]);
    return Response.json({deleted:true});
  }catch(error){return adminErrorResponse(error)}
}
