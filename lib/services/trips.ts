import { Prisma, type Trip } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { conflict, forbidden, notFound } from "@/lib/http";
import { T } from "@/lib/config/thresholds";
import { closeOverspeed } from "@/lib/geo/detectors";
import { resolveAlerts } from "./alerts";
import { refreshDriverRating, scoreForTrip } from "./score";

export async function startTrip(driverId: string, direction: "UP" | "DOWN") {
  await abandonStaleTrips();
  const driver = await prisma.driver.findUnique({ where: { id: driverId }, include: { bus: true } });
  if (!driver) throw notFound("Driver not found");
  try {
    return await prisma.$transaction(async (tx) => {
      const active = await tx.trip.findFirst({
        where: { status: "ACTIVE", OR: [{ driverId }, { busId: driver.busId }] },
      });
      if (active) throw conflict("Driver or bus already has an active trip");
      return tx.trip.create({ data: { driverId, busId: driver.busId, routeId: driver.bus.routeId, direction } });
    });
  } catch (e) {
    // partial unique index catches two starts at the same time
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw conflict("Driver or bus already has an active trip");
    }
    throw e;
  }
}

async function finalizeTrip(tx: Tx, trip: Trip, status: "COMPLETED" | "ABANDONED") {
  const latest = await tx.busLatestLocation.findUnique({ where: { busId: trip.busId } });
  if (latest && latest.tripId === trip.id) {
    const state = { ...latest };
    const ev = closeOverspeed(state, latest.recordedAt, latest);
    if (ev) await tx.drivingEvent.create({ data: { ...ev, tripId: trip.id, driverId: trip.driverId, busId: trip.busId } });
    await tx.busLatestLocation.update({
      where: { busId: trip.busId },
      data: { overspeedSince: null, overspeedMaxKmh: null, stoppedSince: null, slowSince: null },
    });
  }
  await resolveAlerts(tx, trip.busId);
  const score = await scoreForTrip(tx, trip.id);
  const done = await tx.trip.update({ where: { id: trip.id }, data: { status, endedAt: new Date(), score } });
  if (status === "COMPLETED") await refreshDriverRating(tx, trip.driverId);
  return done;
}

export async function endTrip(driverId: string, tripId: string) {
  await abandonStaleTrips();
  return prisma.$transaction(async (tx) => {
    const trip = await tx.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw notFound("Trip not found");
    if (trip.driverId !== driverId) throw forbidden("Not your trip");
    if (trip.status !== "ACTIVE") throw conflict(`Trip is already ${trip.status}`);
    return finalizeTrip(tx, trip, "COMPLETED");
  });
}

export async function abandonStaleTrips(): Promise<number> {
  // columns are UTC "timestamp"; a Date param would get shifted by the DB timezone
  const cutoff = new Date(Date.now() - T.ABANDON_AFTER_MS).toISOString();
  const stale = await prisma.$queryRaw<{ id: string }[]>`
    SELECT t.id FROM trip t
    LEFT JOIN bus_latest_location l ON l."busId" = t."busId" AND l."tripId" = t.id
    WHERE t.status = 'ACTIVE' AND COALESCE(l."updatedAt", t."startedAt") < ${cutoff}::timestamp`;
  for (const { id } of stale) {
    await prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({ where: { id } });
      if (trip?.status === "ACTIVE") await finalizeTrip(tx, trip, "ABANDONED");
    });
  }
  return stale.length;
}

export async function tripView(trip: Trip) {
  const active = trip.status === "ACTIVE";
  return {
    id: trip.id,
    driverId: trip.driverId,
    busId: trip.busId,
    routeId: trip.routeId,
    direction: trip.direction,
    status: trip.status,
    startedAt: trip.startedAt,
    endedAt: trip.endedAt,
    distanceKm: Math.round(trip.distanceKm * 100) / 100,
    score: active ? await scoreForTrip(prisma, trip.id) : trip.score,
    provisional: active,
  };
}

export async function getTrip(id: string) {
  await abandonStaleTrips();
  const trip = await prisma.trip.findUnique({ where: { id } });
  if (!trip) throw notFound("Trip not found");
  return trip;
}

export async function listDriverTrips(driverId: string) {
  await abandonStaleTrips();
  const trips = await prisma.trip.findMany({ where: { driverId }, orderBy: { startedAt: "desc" }, take: 50 });
  return Promise.all(trips.map(tripView));
}

export async function currentTrip(driverId: string) {
  await abandonStaleTrips();
  const trip = await prisma.trip.findFirst({ where: { driverId, status: "ACTIVE" } });
  return trip ? tripView(trip) : null;
}

export async function tripEvents(tripId: string) {
  await getTrip(tripId);
  return prisma.drivingEvent.findMany({ where: { tripId }, orderBy: { occurredAt: "asc" } });
}
