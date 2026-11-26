const noStore = { "Cache-Control": "no-store, max-age=0" };

export function GET() {
  const version = process.env.VERCEL_GIT_COMMIT_SHA
    ?? process.env.VERCEL_URL
    ?? "development";

  return Response.json({ version }, { headers: noStore });
}
