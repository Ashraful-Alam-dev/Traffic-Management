import { prisma } from "@/lib/db";
import { notFound } from "@/lib/http";
import { orderStops } from "@/lib/geo/eta";
import { starsOf } from "./score";
import { abandonStaleTrips } from "./trips";

export async function listRoutes() {
  const routes = await prisma.route.findMany({ include: { company: true, _count: { select: { stops: true } } }, orderBy: { id: "asc" } });
  return routes.map((r) => ({ id: r.id, name: r.name, company: { id: r.company.id, name: r.company.name }, stopCount: r._count.stops }));
}

export async function routeStoppages(routeId: string) {
  const route = await prisma.route.findUnique({ where: { id: routeId } });
  if (!route) throw notFound("Route not found");
  const rs = await prisma.routeStoppage.findMany({ where: { routeId }, include: { stoppage: true } });
  return orderStops(rs, "UP").map((r) => ({ id: r.stoppage.id, name: r.stoppage.name, lat: r.stoppage.lat, lng: r.stoppage.lng, stopOrder: r.stopOrder }));
}

// position is only shown while the bus is on a trip
async function busStates(where: object) {
  await abandonStaleTrips();
  const buses = await prisma.bus.findMany({
    where,
    include: { latest: true, route: true, trips: { where: { status: "ACTIVE" }, take: 1, include: { driver: true } }, drivers: true },
    orderBy: { id: "asc" },
  });
  return buses.map((b) => {
    const trip = b.trips[0] ?? null;
    const live = trip && b.latest && b.latest.tripId === trip.id ? b.latest : null;
    return { bus: b, trip, live };
  });
}

const position = (l: { lat: number; lng: number; speedKmh: number; updatedAt: Date } | null) =>
  l ? { lat: l.lat, lng: l.lng, speedKmh: l.speedKmh, updatedAt: l.updatedAt } : null;

export async function routeBuses(routeId: string) {
  const route = await prisma.route.findUnique({ where: { id: routeId } });
  if (!route) throw notFound("Route not found");
  const states = await busStates({ routeId });
  return states.map(({ bus, trip, live }) => ({
    id: bus.id,
    plateNumber: bus.plateNumber,
    active: !!trip,
    direction: trip?.direction ?? null,
    position: position(live),
  }));
}

export async function passengerBus(busId: string) {
  const [s] = await busStates({ id: busId });
  if (!s) throw notFound("Bus not found");
  const driver = s.trip?.driver ?? s.bus.drivers[0] ?? null;
  return {
    id: s.bus.id,
    plateNumber: s.bus.plateNumber,
    routeId: s.bus.routeId,
    routeName: s.bus.route.name,
    active: !!s.trip,
    direction: s.trip?.direction ?? null,
    position: position(s.live),
    driver: driver ? { displayName: driver.displayName, stars: starsOf(driver.rating) } : null,
  };
}

export async function authorityBuses(f: { routeId?: string; companyId?: string; status?: "ACTIVE" | "IDLE" }) {
  const states = await busStates({ routeId: f.routeId, route: f.companyId ? { companyId: f.companyId } : undefined });
  const openCounts = await prisma.alert.groupBy({ by: ["busId"], where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } }, _count: true });
  const countOf = (id: string) => openCounts.find((c) => c.busId === id)?._count ?? 0;
  return states
    .filter(({ trip }) => !f.status || (f.status === "ACTIVE") === !!trip)
    .map(({ bus, trip, live }) => ({
      id: bus.id,
      plateNumber: bus.plateNumber,
      routeId: bus.routeId,
      status: trip ? "ACTIVE" : "IDLE",
      tripId: trip?.id ?? null,
      driverId: trip?.driverId ?? null,
      direction: trip?.direction ?? null,
      position: position(live),
      activeAlerts: countOf(bus.id),
    }));
}
