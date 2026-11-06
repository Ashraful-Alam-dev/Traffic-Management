import { prisma } from "@/lib/db";
import { orderStops, type Stop } from "@/lib/geo/eta";

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; stops: (Stop & { stopOrder: number })[] }>();

export async function routeStops(routeId: string, direction: "UP" | "DOWN") {
  const key = `${routeId}:${direction}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.stops;
  const rs = await prisma.routeStoppage.findMany({ where: { routeId }, include: { stoppage: true } });
  const stops = orderStops(
    rs.map((r) => ({ id: r.stoppageId, stopOrder: r.stopOrder, lat: r.stoppage.lat, lng: r.stoppage.lng })),
    direction,
  );
  cache.set(key, { at: Date.now(), stops });
  return stops;
}
