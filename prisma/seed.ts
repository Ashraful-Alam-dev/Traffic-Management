// Safe to run twice: fixed ids + upserts.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "node:fs";

if (fs.existsSync(".env")) process.loadEnvFile(".env");
const prisma = new PrismaClient();
const isProd = process.env.NODE_ENV === "production";

function demoPassword(name: string, fallback: string): string {
  const v = process.env[name];
  if (v) return v;
  if (isProd) throw new Error(`${name} must be set in production`);
  return fallback;
}

const STOPPAGES = [
  { id: "stp-gabtoli", name: "Gabtoli", lat: 23.7836, lng: 90.3442 },
  { id: "stp-shyamoli", name: "Shyamoli", lat: 23.7745, lng: 90.3657 },
  { id: "stp-farmgate", name: "Farmgate", lat: 23.7577, lng: 90.3897 },
  { id: "stp-shahbag", name: "Shahbag", lat: 23.7389, lng: 90.3958 },
  { id: "stp-motijheel", name: "Motijheel", lat: 23.733, lng: 90.4172 },
  { id: "stp-mirpur10", name: "Mirpur 10", lat: 23.8069, lng: 90.3687 },
];

const ROUTES = [
  { id: "route-1", name: "Gabtoli - Motijheel", stops: ["stp-gabtoli", "stp-shyamoli", "stp-farmgate", "stp-shahbag", "stp-motijheel"] },
  { id: "route-2", name: "Mirpur 10 - Shahbag", stops: ["stp-mirpur10", "stp-farmgate", "stp-shahbag"] },
];

const BUSES = [
  { id: "bus-1", plateNumber: "DHAKA-METRO-BA-11-1001", routeId: "route-1" },
  { id: "bus-2", plateNumber: "DHAKA-METRO-BA-11-1002", routeId: "route-1" },
  { id: "bus-3", plateNumber: "DHAKA-METRO-BA-11-1003", routeId: "route-2" },
];

const DRIVERS = [
  { id: "drv-1", userId: "usr-drv-1", email: "karim@demo.bus", name: "Karim Uddin", displayName: "Karim", busId: "bus-1" },
  { id: "drv-2", userId: "usr-drv-2", email: "rahim@demo.bus", name: "Rahim Mia", displayName: "Rahim", busId: "bus-2" },
  { id: "drv-3", userId: "usr-drv-3", email: "salam@demo.bus", name: "Abdus Salam", displayName: "Salam", busId: "bus-3" },
];

// past trips so Karim has a rating from the start
const HISTORY_SCORES = [95, 80, 100, 70, 85, 90];

async function main() {
  const driverPw = demoPassword("DEMO_DRIVER_PASSWORD", "driver-demo-123");
  const authorityPw = demoPassword("DEMO_AUTHORITY_PASSWORD", "authority-demo-123");
  const driverHash = await bcrypt.hash(driverPw, 10);
  const authorityHash = await bcrypt.hash(authorityPw, 10);

  await prisma.busCompany.upsert({
    where: { id: "co-1" },
    update: {},
    create: { id: "co-1", name: "Dhaka Paribahan Ltd (demo)", ownerName: "Demo Owner" },
  });

  for (const s of STOPPAGES) await prisma.stoppage.upsert({ where: { id: s.id }, update: s, create: s });

  for (const r of ROUTES) {
    await prisma.route.upsert({
      where: { id: r.id },
      update: { name: r.name },
      create: { id: r.id, name: r.name, companyId: "co-1" },
    });
    for (const [i, stoppageId] of r.stops.entries()) {
      await prisma.routeStoppage.upsert({
        where: { routeId_stoppageId: { routeId: r.id, stoppageId } },
        update: { stopOrder: i + 1 },
        create: { routeId: r.id, stoppageId, stopOrder: i + 1 },
      });
    }
  }

  for (const b of BUSES) await prisma.bus.upsert({ where: { id: b.id }, update: b, create: b });

  for (const d of DRIVERS) {
    await prisma.appUser.upsert({
      where: { id: d.userId },
      update: { passwordHash: driverHash },
      create: { id: d.userId, email: d.email, passwordHash: driverHash, role: "driver" },
    });
    await prisma.driver.upsert({
      where: { id: d.id },
      update: {},
      create: { id: d.id, userId: d.userId, name: d.name, displayName: d.displayName, busId: d.busId },
    });
  }

  await prisma.appUser.upsert({
    where: { id: "usr-auth-1" },
    update: { passwordHash: authorityHash },
    create: { id: "usr-auth-1", email: "authority@demo.bus", passwordHash: authorityHash, role: "authority" },
  });

  for (const [i, score] of HISTORY_SCORES.entries()) {
    const ended = new Date(Date.now() - (i + 1) * 86_400_000);
    const started = new Date(ended.getTime() - 50 * 60_000);
    await prisma.trip.upsert({
      where: { id: `hist-${i + 1}` },
      update: {},
      create: {
        id: `hist-${i + 1}`,
        driverId: "drv-1",
        busId: "bus-1",
        routeId: "route-1",
        direction: i % 2 === 0 ? "UP" : "DOWN",
        startedAt: started,
        endedAt: ended,
        status: "COMPLETED",
        distanceKm: 12.4,
        score,
      },
    });
  }
  const avg = HISTORY_SCORES.reduce((a, b) => a + b, 0) / HISTORY_SCORES.length;
  await prisma.driver.update({ where: { id: "drv-1" }, data: { rating: Math.round(avg * 100) / 100, ratedTripsCount: HISTORY_SCORES.length } });

  console.log("Seed done. Demo accounts:");
  console.log("  drivers:   karim@demo.bus (bus-1, has rating), rahim@demo.bus, salam@demo.bus");
  console.log("  authority: authority@demo.bus");
  if (!isProd) console.log(`  passwords (dev only): driver=${driverPw} authority=${authorityPw}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
