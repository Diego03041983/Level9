import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  if (!/^[A-Z2-9]{10}$/.test(code)) return NextResponse.redirect(new URL("/tv?pairing=invalid", request.url));

  const sessionToken = randomBytes(32).toString("base64url");
  const codeHash = createHash("sha256").update(code).digest("hex");
  const tokenHash = createHash("sha256").update(sessionToken).digest("hex");
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("redeem_display_pairing_code", {
    p_code_hash: codeHash,
    p_session_token_hash: tokenHash,
  });
  const pairing = Array.isArray(data) ? data[0] : data;
  if (error || !pairing?.event_id || !pairing?.device_id) {
    return NextResponse.redirect(new URL("/tv?pairing=expired", request.url));
  }

  const envelope = Buffer.from(JSON.stringify({
    eventId: pairing.event_id,
    deviceId: pairing.device_id,
    sessionToken,
  }), "utf8").toString("base64url");
  const target = new URL("/tv", request.url);
  target.hash = `pairing=${envelope}`;
  return NextResponse.redirect(target, { headers: { "Cache-Control": "no-store, private" } });
}
