import type {SupabaseClient} from "@supabase/supabase-js";

export async function resolveMissionFinaleVideo(supabase:SupabaseClient,eventId:string){
  const {data,error}=await supabase.from("media_assets")
    .select("storage_path,metadata").eq("event_id",eventId)
    .eq("logical_key","glitch-defeat-video").eq("status","active").maybeSingle();
  if(error||!data?.storage_path)return null;
  const durationMs=Number((data.metadata as Record<string,unknown>|null)?.durationMs);
  return {path:data.storage_path,durationMs:Number.isFinite(durationMs)&&durationMs>0?durationMs:undefined};
}
