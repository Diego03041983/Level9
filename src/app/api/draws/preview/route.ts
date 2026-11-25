import { NextResponse } from "next/server";
import { z } from "zod";
import { drawParticipants } from "@/lib/domain";

const candidateSchema = z.object({
  id: z.string().min(1),
  registered: z.boolean(),
  active: z.boolean(),
  occupied: z.boolean(),
  enabledActivityIds: z.array(z.string()),
  participationCount: z.number().int().nonnegative(),
});

const requestSchema = z.object({
  candidates: z.array(candidateSchema).max(100),
  count: z.number().int().positive().max(100),
  activityId: z.string().min(1),
  mode: z.enum(["random", "balanced"]).default("balanced"),
  fixedIds: z.array(z.string()).default([]),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Solicitud de sorteo inválida", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = drawParticipants(parsed.data);
    return NextResponse.json({
      preview: true,
      selectedIds: result.selected.map(({ id }) => id),
      eligibleIds: result.eligible.map(({ id }) => id),
      excluded: result.excluded,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo realizar el sorteo" },
      { status: 409 },
    );
  }
}
