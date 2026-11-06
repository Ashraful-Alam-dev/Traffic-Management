import { prisma, type Tx } from "@/lib/db";
import { driverRating, tripScore } from "@/lib/geo/score";
import { T } from "@/lib/config/thresholds";

export async function scoreForTrip(db: Tx | typeof prisma, tripId: string): Promise<number> {
  const events = await db.drivingEvent.findMany({ where: { tripId }, select: { penalty: true, cancelled: true } });
  return tripScore(events);
}

async function completedScores(db: Tx | typeof prisma, driverId: string): Promise<number[]> {
  const trips = await db.trip.findMany({
    where: { driverId, status: "COMPLETED", score: { not: null } },
    orderBy: { endedAt: "desc" },
    take: T.RATING_WINDOW,
    select: { score: true },
  });
  return trips.map((t) => t.score as number);
}

export async function refreshDriverRating(tx: Tx, driverId: string) {
  const r = driverRating(await completedScores(tx, driverId));
  await tx.driver.update({ where: { id: driverId }, data: { rating: r.rating, ratedTripsCount: r.tripsCounted } });
}

export async function getDriverRating(driverId: string) {
  const r = driverRating(await completedScores(prisma, driverId));
  return { driverId, ...r };
}

export const starsOf = (rating: number | null) => (rating === null ? null : Math.round((rating / 20) * 10) / 10);
