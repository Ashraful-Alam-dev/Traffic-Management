import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { conflict, forbidden, notFound, tooMany } from "@/lib/http";
import { T } from "@/lib/config/thresholds";
import { isNearAny } from "@/lib/geo";
import { detect, type Point } from "@/lib/geo/detectors";
import { advanceNextStop } from "@/lib/geo/eta";
import { routeStops } from "./route-stops";
import { openAlert, resolveAlerts } from "./alerts";

type LockedTrip = { id: string; driverId: string; busId: string; routeId: string; direction: "UP" | "DOWN"; status: string };

export async function postLocation(driverId: string, tripId: string, p: Point) {
  return prisma.$transaction(async (tx) => {
    // lock the trip so points from one bus are processed in order
    const [trip] = await tx.$queryRaw<LockedTrip[]>`
      SELECT id, "driverId", "busId", "routeId", direction::text AS direction, status::text AS status
      FROM trip WHERE id = ${tripId} FOR UPDATE`;
    if (!trip) throw notFound("Trip not found");
    if (trip.driverId !== driverId) throw forbidden("You can only post to your own trip");
    if (trip.status !== "ACTIVE") throw conflict(`Trip is ${trip.status}`);

    const latest = await tx.busLatestLocation.findUnique({ where: { busId: trip.busId } });
    const prev = latest && latest.tripId === trip.id ? latest : null; // new trip = fresh detector state

    const id = randomUUID();
    const base = { id, tripId: trip.id, busId: trip.busId, lat: p.lat, lng: p.lng, speedKmh: p.speedKmh, recordedAt: p.recordedAt };
    const insert = async () => (await tx.location.createMany({ data: [base], skipDuplicates: true })).count === 1;
    const duplicate = async () => {
      const dup = await tx.location.findUnique({ where: { busId_recordedAt: { busId: trip.busId, recordedAt: p.recordedAt } } });
      return { applied: false, duplicate: true, locationId: dup?.id ?? null, events: [], alertsOpened: [] };
    };

    if (prev && p.recordedAt.getTime() === prev.recordedAt.getTime()) return duplicate();

    // late point: keep it, but don't let it touch detector state
    if (prev && p.recordedAt < prev.recordedAt) {
      if (!(await insert())) return duplicate();
      return { applied: false, duplicate: false, locationId: id, events: [], alertsOpened: [] };
    }

    if (prev && p.recordedAt.getTime() - prev.recordedAt.getTime() < T.MIN_INTERVAL_MS) {
      throw tooMany("Location updates must be at least 2 s apart");
    }

    if (!(await insert())) return duplicate();

    const stops = await routeStops(trip.routeId, trip.direction);
    const near = isNearAny(p, stops, T.STOPPAGE_RADIUS_M);
    const r = detect(prev, p, near);
    const loc = { id };

    for (const ev of r.events) {
      await tx.drivingEvent.create({ data: { ...ev, tripId: trip.id, driverId, busId: trip.busId } });
    }
    if (r.cancelStopEventsSince) {
      await tx.drivingEvent.updateMany({
        where: { tripId: trip.id, type: "UNSCHEDULED_STOP", cancelled: false, occurredAt: { gte: r.cancelStopEventsSince } },
        data: { cancelled: true },
      });
    }

    if (r.resolveAlerts.length) await resolveAlerts(tx, trip.busId, r.resolveAlerts);
    const alertsOpened: string[] = [];
    for (const type of r.openAlerts) {
      const a = await openAlert(tx, { busId: trip.busId, tripId: trip.id, type, lat: p.lat, lng: p.lng });
      if (a) alertsOpened.push(type);
    }

    const prevIdx = prev?.nextStopOrder ?? 0;
    const nextStopOrder = advanceNextStop(stops, prevIdx, p);
    if (nextStopOrder > prevIdx) {
      await tx.stopArrival.createMany({
        data: stops.slice(prevIdx, nextStopOrder).map((s, i) => ({
          tripId: trip.id,
          busId: trip.busId,
          routeId: trip.routeId,
          direction: trip.direction,
          stoppageId: s.id,
          stopIndex: prevIdx + i,
          arrivedAt: p.recordedAt,
        })),
        skipDuplicates: true,
      });
    }
    const s = r.state;
    const latestData = {
      tripId: trip.id,
      lat: s.lat,
      lng: s.lng,
      speedKmh: s.speedKmh,
      recordedAt: s.recordedAt,
      stoppedSince: s.stoppedSince,
      slowSince: s.slowSince,
      overspeedSince: s.overspeedSince,
      overspeedMaxKmh: s.overspeedMaxKmh,
      lastHarshBrakeAt: s.lastHarshBrakeAt,
      nextStopOrder,
    };
    await tx.busLatestLocation.upsert({
      where: { busId: trip.busId },
      update: latestData,
      create: { busId: trip.busId, ...latestData },
    });

    if (r.addDistanceKm > 0) {
      await tx.trip.update({ where: { id: trip.id }, data: { distanceKm: { increment: r.addDistanceKm } } });
    }

    return { applied: true, duplicate: false, locationId: loc.id, events: r.events.map((e) => e.type), alertsOpened };
  }, { maxWait: 5_000, timeout: 10_000 }); // queue briefly for a pooled connection under bursts
}
