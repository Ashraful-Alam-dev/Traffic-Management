import { prisma } from "@/lib/db";
import { tooMany } from "@/lib/http";
import { T } from "@/lib/config/thresholds";

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function limitPublic(req: Request) {
  const key = `ip:${clientIp(req)}`;
  // UTC, same as Prisma's timestamps
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limit (key, "windowStart", count)
    VALUES (${key}, date_trunc('minute', now() AT TIME ZONE 'UTC'), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limit."windowStart" = date_trunc('minute', now() AT TIME ZONE 'UTC') THEN rate_limit.count + 1 ELSE 1 END,
      "windowStart" = date_trunc('minute', now() AT TIME ZONE 'UTC')
    RETURNING count`;
  if ((rows[0]?.count ?? 0) > T.PUBLIC_RATE_PER_MIN) throw tooMany("Rate limit: 60 requests per minute");
}

export async function cleanupRateLimits() {
  await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 3_600_000) } } });
}
