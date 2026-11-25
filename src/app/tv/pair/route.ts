import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { eventId?: string; name?: string };
    if (!body.eventId || !/^[0-9a-f-]{36}$/i.test(body.eventId)) return NextResponse.json({ error: "EVENT_ID_REQUIRED" }, { status: 400 });
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    const { data: membership } = await supabase.from("event_users").select("role").eq("event_id", body.eventId).eq("user_id", auth.user.id).in("role", ["owner", "admin", "operator"]).maybeSingle();
    if (!membership) return NextResponse.json({ error: "EVENT_ADMIN_REQUIRED" }, { status: 403 });

    const admin = createAdminClient(); const now = new Date();
    const { data: device, error: deviceError } = await admin.from("display_devices").insert({ event_id: body.eventId, name: (body.name?.trim() || "Smart TV").slice(0, 80), linked_at: now.toISOString(), last_seen_at: null, audio_enabled: false }).select("id").single();
    if (deviceError || !device) throw deviceError ?? new Error("Device creation failed");
    const sessionToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(sessionToken).digest("hex");
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const { error: sessionError } = await admin.from("display_sessions").insert({ device_id: device.id, token_hash: tokenHash, expires_at: expiresAt.toISOString() });
    if (sessionError) { await admin.from("display_devices").delete().eq("id", device.id); throw sessionError; }
    const envelope = Buffer.from(JSON.stringify({ eventId: body.eventId, deviceId: device.id, sessionToken }), "utf8").toString("base64url");
    const origin = process.env.APP_URL?.replace(/\/$/, "") || request.nextUrl.origin;
    return NextResponse.json({ deviceId: device.id, expiresAt: expiresAt.toISOString(), pairingUrl: `${origin}/tv#pairing=${envelope}` }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("Display pairing failed", error);
    return NextResponse.json({ error: "PAIRING_FAILED" }, { status: 503 });
  }
}
