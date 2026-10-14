import { connection } from "next/server";
import { listPostingDays } from "@/lib/dibbs/files";
import { DibbsSession } from "@/lib/dibbs/session";

/** DIBBS health: proves this deployment can get past the DoD consent banner and list posting days. */
export async function GET() {
  await connection();
  const started = performance.now();
  try {
    const days = await listPostingDays(new DibbsSession());
    return Response.json({
      ok: true,
      postingDays: days.length,
      latest: days[0]?.postDate ?? null,
      latencyMs: Math.round(performance.now() - started),
    });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 502 });
  }
}
