import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  code: z.string().regex(/^\d{4,8}$/),
  demo: z.boolean().default(false),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ granted: false, error: "Código inválido" }, { status: 400 });
  }

  const configuredCode = process.env.MISSION_SECRET_CODE;
  const demoEnabled =
    parsed.data.demo || process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
  const expected = demoEnabled ? configuredCode ?? "2909" : configuredCode;
  if (!expected) {
    return NextResponse.json(
      { granted: false, error: "Misión no configurada" },
      { status: 503 },
    );
  }

  // Constant-size loop avoids returning early on the first differing digit.
  let difference = expected.length ^ parsed.data.code.length;
  const maxLength = Math.max(expected.length, parsed.data.code.length);
  for (let index = 0; index < maxLength; index += 1) {
    difference |= (expected.charCodeAt(index) || 0) ^ (parsed.data.code.charCodeAt(index) || 0);
  }

  return NextResponse.json({ granted: difference === 0 });
}
