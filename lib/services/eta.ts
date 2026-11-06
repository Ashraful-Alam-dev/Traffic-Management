import { prisma } from "@/lib/db";
import { notFound } from "@/lib/http";
import { computeEta, computeEtaWithHistory, etaConfidence, segKey, type SegmentHistory } from "@/lib/geo/eta";
import { routeStops } from "./route-stops";
import { T } from "@/lib/config/thresholds";
import { abandonStaleTrips } from "./trips";

export const dhakaHour = (d: Date) => (d.getUTCHours() + T.DHAKA_UTC_OFFSET_H) % 24;

const historyCache = new Map<string, Promise<SegmentHistory>>();

// only data that existed at prediction time (`before`), cached per minute
export function loadSegmentHistory(routeId: string, direction: "UP" | "DOWN", hour: number, before: Date): Promise<SegmentHistory> {
  const minute = Math.floor(before.getTime() / 60_000);
  const key = `${routeId}:${direction}:${hour}:${minute}`;
  let hit = historyCache.get(key);
  if (!hit) {
    if (historyCache.size > 500) historyCache.clear();
    hit = querySegmentHistory(routeId, direction, hour, new Date(minute * 60_000));
    hit.catch(() => historyCache.delete(key));
    historyCache.set(key, hit);
  }
  return hit;
}

async function querySegmentHistory(routeId: string, direction: "UP" | "DOWN", hour: number, before: Date): Promise<SegmentHistory> {
  const rows = await prisma.$queryRaw<{ fromId: string; toId: string; avgS: number; n: number }[]>`
    SELECT a1."stoppageId" AS "fromId", a2."stoppageId" AS "toId",
           AVG(EXTRACT(EPOCH FROM a2."arrivedAt" - a1."arrivedAt"))::float AS "avgS", COUNT(*)::int AS n
    FROM stop_arrival a1
    JOIN stop_arrival a2 ON a2."tripId" = a1."tripId" AND a2."stopIndex" = a1."stopIndex" + 1
    WHERE a1."routeId" = ${routeId} AND a1.direction::text = ${direction} AND a2."arrivedAt" < ${before.toISOString()}::timestamp
      AND EXTRACT(HOUR FROM a1."arrivedAt" + make_interval(hours => ${T.DHAKA_UTC_OFFSET_H}::int))::int = ${hour}::int
    GROUP BY 1, 2`;
  return new Map(rows.map((r) => [segKey(r.fromId, r.toId), { avgS: r.avgS, samples: r.n }]));
}

export async function getEta(busId: string, stoppageId: string) {
  await abandonStaleTrips();
  const bus = await prisma.bus.findUnique({ where: { id: busId }, include: { latest: true } });
  if (!bus) throw notFound("Bus not found");
  const stoppage = await prisma.stoppage.findUnique({ where: { id: stoppageId } });
  if (!stoppage) throw notFound("Stoppage not found");

  const base = { busId, stoppageId, stoppageName: stoppage.name };
  const trip = await prisma.trip.findFirst({ where: { busId, status: "ACTIVE" } });
  const latest = bus.latest;
  if (!trip || !latest || latest.tripId !== trip.id) {
    return { ...base, eta: null, reason: "NO_ACTIVE_TRIP", method: null, confidence: null };
  }

  const stops = await routeStops(trip.routeId, trip.direction);
  const recent = await prisma.location.findMany({
    where: { tripId: trip.id },
    orderBy: { recordedAt: "desc" },
    take: T.ETA_SPEED_SAMPLES,
    select: { speedKmh: true },
  });
  const speeds = recent.map((x) => x.speedKmh);
  const nextIdx = latest.nextStopOrder ?? 0;

  const history = await loadSegmentHistory(trip.routeId, trip.direction, dhakaHour(latest.recordedAt), latest.recordedAt);
  const r = computeEtaWithHistory(stops, nextIdx, latest, stoppageId, speeds, history);
  if (!r.eta) return { ...base, eta: null, reason: r.reason, method: null, confidence: null };

  const live = computeEta(stops, nextIdx, latest, stoppageId, speeds);
  const madeAt = latest.recordedAt;
  const minuteBucket = Math.floor(madeAt.getTime() / 60_000);
  const log = (method: "LIVE" | "HISTORY", seconds: number) => ({
    tripId: trip.id,
    stoppageId,
    method,
    madeAt,
    minuteBucket,
    horizonS: seconds,
    predictedArrivalAt: new Date(madeAt.getTime() + seconds * 1000),
  });
  // log HISTORY only when history was actually used, so the comparison stays fair
  const data = [log("LIVE", live.eta?.seconds ?? r.eta.seconds)];
  if (r.method === "HISTORY") data.push(log("HISTORY", r.eta.seconds));
  await prisma.etaPrediction.createMany({ data, skipDuplicates: true });

  return {
    ...base,
    eta: {
      seconds: r.eta.seconds,
      arrivalAt: new Date(Date.now() + r.eta.seconds * 1000).toISOString(),
      distanceM: r.eta.distanceM,
      speedKmh: r.eta.speedKmh,
    },
    reason: null,
    method: r.method,
    confidence: etaConfidence(latest.updatedAt),
  };
}
