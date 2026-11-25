import { NextRequest, NextResponse } from "next/server";
import { CheckinServerError, requireCheckinContext } from "@/lib/checkin/server";

export async function GET(request: NextRequest) {
  try {
    const eventId = request.nextUrl.searchParams.get("eventId") ?? undefined;
    const demo = request.nextUrl.searchParams.get("mode") === "demo";
    const { context } = await requireCheckinContext(eventId, demo);
    return NextResponse.json(context, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof CheckinServerError) {
      const status = error.code === "UNAUTHENTICATED" ? 401 : error.code === "NOT_CONFIGURED" ? 503 : 403;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ error: "No se pudo cargar el evento" }, { status: 500 });
  }
}
