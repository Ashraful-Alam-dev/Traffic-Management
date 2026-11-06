import { prisma } from "@/lib/db";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  let db = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "unreachable";
  }
  const ok = db === "ok";
  return json({ status: ok ? "ok" : "degraded", db, time: new Date().toISOString() }, ok ? 200 : 503);
}
