import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ code: z.string().regex(/^\d{4,8}$/), missionId: z.uuid().optional() });
type Membership = { event_id: string };
type Mission = { id: string; event_id: string; name: string; story: string | null; duration_seconds: number | null; status: string; started_at: string | null; paused_at: string | null };

async function context() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 }) };
  const { data: membership } = await supabase.from("event_users").select("event_id").eq("user_id", auth.user.id).in("role", ["owner", "admin", "operator", "display"]).limit(1).maybeSingle();
  const member = membership as unknown as Membership | null;
  if (!member) return { error: NextResponse.json({ error: "MISSION_ACCESS_REQUIRED" }, { status: 403 }) };
  return { supabase, eventId: member.event_id };
}

export async function GET() {
  const access = await context();
  if (access.error) return access.error;
  const { data, error } = await access.supabase.from("missions").select("id,event_id,name,story,duration_seconds,status,started_at,paused_at").eq("event_id", access.eventId).in("status", ["ready", "live", "paused", "unlocked"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: "MISSION_UNAVAILABLE" }, { status: 503 });
  if (!data) return NextResponse.json({ error: "MISSION_NOT_CONFIGURED" }, { status: 404 });
  const mission = data as unknown as Mission;
  return NextResponse.json({ mission: { id: mission.id, name: mission.name, story: mission.story, durationSeconds: mission.duration_seconds, status: mission.status, startedAt: mission.started_at, pausedAt: mission.paused_at }, serverTime: new Date().toISOString() });
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ granted: false, error: "Código inválido" }, { status: 400 });
  const access = await context();
  if (access.error) return access.error;
  let query = access.supabase.from("missions").select("id,event_id,status").eq("event_id", access.eventId);
  if (parsed.data.missionId) query = query.eq("id", parsed.data.missionId);
  const { data: mission } = await query.in("status", ["live", "paused"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!mission) return NextResponse.json({ granted: false, error: "Misión no configurada" }, { status: 404 });
  const media = createAdminClient();
  const {data:finalVideo,error:videoError}=await media.from("media_assets").select("storage_path").eq("event_id",access.eventId).eq("logical_key","glitch-defeat-video").eq("status","active").maybeSingle();
  if(videoError||!finalVideo?.storage_path)return NextResponse.json({granted:false,error:"Falta el video final de Glitch"},{status:409});
  const{error:fileError}=await media.storage.from("event-media").info(finalVideo.storage_path);
  if(fileError)return NextResponse.json({granted:false,error:"El video final de Glitch no está disponible"},{status:409});
  const { data: granted, error } = await access.supabase.rpc("validate_mission_code", { target_mission: mission.id, submitted_code: parsed.data.code, target_device: null });
  if (error) return NextResponse.json({ granted: false, error: "No se pudo validar el código" }, { status: 409 });
  if (granted) {
    await media.from("scene_events").update({status:"expired"}).eq("event_id",access.eventId)
      .in("status",["queued","delivered","playing"]).neq("scene_type","GLITCH_DEFEATED");
  }
  return NextResponse.json({ granted: Boolean(granted) });
}
