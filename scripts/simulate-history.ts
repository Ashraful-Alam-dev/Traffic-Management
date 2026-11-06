// npm run simulate:history -- --trips 120
// Calls the services directly because the API only accepts points from the last 10 minutes.
import fs from "node:fs";

if (fs.existsSync(".env")) process.loadEnvFile(".env");
if (process.env.NODE_ENV === "production") throw new Error("Not for production databases");

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};

(async () => {
  const { prisma } = await import("@/lib/db");
  const { startTrip, endTrip } = await import("@/lib/services/trips");
  const { postLocation } = await import("@/lib/services/location");
  const { getEta, dhakaHour } = await import("@/lib/services/eta");
  const { etaAccuracy } = await import("@/lib/services/analytics");
  const { orderStops } = await import("@/lib/geo/eta");
  const { tripPoints } = await import("./sim/world");
  type Profile = import("./sim/world").Profile;

  const totalTrips = Number(arg("trips", "60"));
  const nowHour = dhakaHour(new Date());
  const hours = [...new Set(arg("hours", `8,13,18,${nowHour}`).split(",").map(Number))];
  const DT_S = 5; // fine enough for the 10 s overspeed and 1-10 s braking rules

  const drivers: { id: string; profile: Profile }[] = [
    { id: "drv-1", profile: "careful" },
    { id: "drv-2", profile: "aggressive" },
    { id: "drv-3", profile: "normal" },
  ];

  for (const d of drivers) {
    const active = await prisma.trip.findFirst({ where: { driverId: d.id, status: "ACTIVE" } });
    if (active) await endTrip(d.id, active.id);
  }

  async function stopsFor(driverId: string, direction: "UP" | "DOWN") {
    const drv = await prisma.driver.findUniqueOrThrow({ where: { id: driverId }, include: { bus: true } });
    const rs = await prisma.routeStoppage.findMany({ where: { routeId: drv.bus.routeId }, include: { stoppage: true } });
    const stops = orderStops(rs.map((r) => ({ ...r.stoppage, stopOrder: r.stopOrder })), direction);
    return { busId: drv.busId, stops };
  }

  let done = 0;
  const started = Date.now();

  async function runDriver(d: (typeof drivers)[number], trips: number, seedBase: number) {
    for (let i = 0; i < trips; i++) {
      const seed = seedBase + i;
      const direction = i % 2 === 0 ? "UP" : "DOWN";
      const hour = hours[Math.floor(i / 2) % hours.length];
      const daysAgo = 1 + ((seed * 7) % 20);
      const day = new Date(Date.now() - daysAgo * 86_400_000);
      const startMs = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour - 6, (seed * 13) % 50);

      const { busId, stops } = await stopsFor(d.id, direction);
      const trip = await startTrip(d.id, direction);
      let n = 0;
      for (const p of tripPoints({ stops, startMs, hour, profile: d.profile, seed, dtS: DT_S })) {
        await postLocation(d.id, trip.id, { lat: p.lat, lng: p.lng, speedKmh: p.speedKmh, recordedAt: new Date(p.t) });
        if (++n % 15 === 0) for (const s of stops) await getEta(busId, s.id);
      }
      await endTrip(d.id, trip.id);
      done++;
      process.stdout.write(`\r  trips done: ${done}/${totalTrips}`);
    }
  }

  console.log(`Simulating ${totalTrips} past trips at Dhaka hours ${hours.join(", ")} (3 drivers in parallel)...`);
  const per = Math.ceil(totalTrips / drivers.length);
  await Promise.all(drivers.map((d, i) => runDriver(d, Math.min(per, totalTrips - per * i), 1000 * (i + 1))));
  console.log(`\nDone in ${Math.round((Date.now() - started) / 1000)} s.\n`);

  const acc = await etaAccuracy();
  const row = (name: string, s: typeof acc.live.overall) =>
    `${name.padEnd(8)} predictions ${String(s.predictions).padStart(6)} | mean error ${s.meanAbsErrorS ?? "-"} s | median ${s.medianAbsErrorS ?? "-"} s | p90 ${s.p90AbsErrorS ?? "-"} s | within 2 min ${s.within2MinPct ?? "-"}%`;
  console.log("ETA accuracy, all LIVE predictions:");
  console.log(row("LIVE", acc.live.overall));
  console.log("\nHead to head, same moments, where past data existed:");
  console.log(row("LIVE", acc.headToHead.live));
  console.log(row("HISTORY", acc.headToHead.history));
  for (const h of acc.headToHead.byHorizon) {
    console.log(`  ${h.horizon.padEnd(9)} pairs ${String(h.pairs).padStart(5)} | live ${h.liveMeanAbsErrorS ?? "-"} s -> history ${h.historyMeanAbsErrorS ?? "-"} s (${h.improvementPct ?? "-"}%)`);
  }
  console.log(`History vs live: ${acc.historyVsLiveImprovementPct ?? "-"}% lower mean error`);

  const ratings = await prisma.driver.findMany({ select: { displayName: true, rating: true }, orderBy: { id: "asc" } });
  console.log("\nDriver ratings:", ratings.map((r) => `${r.displayName} ${r.rating ?? "n/a"}`).join(", "));
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
