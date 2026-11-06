import { timingSafeEqual } from "node:crypto";
import { handler, json, unauthorized } from "@/lib/http";
import { abandonStaleTrips } from "@/lib/services/trips";
import { cleanupRateLimits } from "@/lib/services/ratelimit";

function secretOk(given: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const POST = handler(async (req: Request) => {
  if (!secretOk(req.headers.get("x-cron-secret"))) throw unauthorized("Invalid cron secret");
  const abandoned = await abandonStaleTrips();
  await cleanupRateLimits();
  return json({ abandoned }, 200, req);
});
