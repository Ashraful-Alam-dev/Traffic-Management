// npm run loadtest -- --buses 300 --passengers 300 --seconds 60
import fs from "node:fs";
import os from "node:os";
import bcrypt from "bcryptjs";

if (fs.existsSync(".env")) process.loadEnvFile(".env");
if (process.env.NODE_ENV === "production") throw new Error("Not for production databases");
const API = (process.env.API_URL ?? "http://localhost:3000") + "/api/v1";
const arg = (n: string, d: number) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? Number(process.argv[i + 1]) : d;
};
const BUSES = arg("buses", 200);
const PASSENGERS = arg("passengers", 200);
const SECONDS = arg("seconds", 60);
const INTERVAL_MS = 5000;
const PW = "load-test-only";

type Stat = { ms: number[]; codes: Record<number, number> };
const stats: Record<string, Stat> = { location: { ms: [], codes: {} }, eta: { ms: [], codes: {} } };

async function timed(kind: string, url: string, init: RequestInit) {
  const s = stats[kind];
  const t0 = performance.now();
  try {
    const res = await fetch(url, init);
    await res.arrayBuffer();
    s.codes[res.status] = (s.codes[res.status] ?? 0) + 1;
  } catch {
    s.codes[0] = (s.codes[0] ?? 0) + 1; // network error
  }
  s.ms.push(performance.now() - t0);
}

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: size }, async () => {
    while (queue.length) await fn(queue.shift()!);
  }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (a: number[], q: number) => a[Math.min(a.length - 1, Math.floor(q * a.length))];

(async () => {
  const { prisma } = await import("@/lib/db");
  const ids = Array.from({ length: BUSES }, (_, i) => i + 1);

  async function cleanup() {
    const lt = { startsWith: "lt-" };
    const trips = await prisma.trip.findMany({ where: { busId: lt }, select: { id: true } });
    const tripIds = trips.map((t) => t.id);
    await prisma.etaPrediction.deleteMany({ where: { tripId: { in: tripIds } } });
    await prisma.stopArrival.deleteMany({ where: { tripId: { in: tripIds } } });
    await prisma.drivingEvent.deleteMany({ where: { busId: lt } });
    await prisma.alert.deleteMany({ where: { busId: lt } });
    await prisma.location.deleteMany({ where: { busId: lt } });
    await prisma.busLatestLocation.deleteMany({ where: { busId: lt } });
    await prisma.trip.deleteMany({ where: { busId: lt } });
    await prisma.driver.deleteMany({ where: { id: lt } });
    await prisma.appUser.deleteMany({ where: { id: lt } });
    await prisma.bus.deleteMany({ where: { id: lt } });
    await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "ip:10.77." } } });
  }

  console.log(`Setup: ${BUSES} buses, ${PASSENGERS} passengers, ${SECONDS} s, API ${API}`);
  await cleanup();
  const hash = await bcrypt.hash(PW, 4);
  await prisma.bus.createMany({ data: ids.map((i) => ({ id: `lt-bus-${i}`, plateNumber: `LT-${i}`, routeId: "route-1" })) });
  await prisma.appUser.createMany({ data: ids.map((i) => ({ id: `lt-usr-${i}`, email: `lt-${i}@load.test`, passwordHash: hash, role: "driver" as const })) });
  await prisma.driver.createMany({ data: ids.map((i) => ({ id: `lt-drv-${i}`, userId: `lt-usr-${i}`, name: `Load ${i}`, displayName: `L${i}`, busId: `lt-bus-${i}` })) });

  const tokens: string[] = [];
  const tripIds: string[] = [];
  await pool(ids, 20, async (i) => {
    const login = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `lt-${i}@load.test`, password: PW }) });
    const token = (await login.json()).token;
    const trip = await fetch(`${API}/trips`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ direction: "UP" }) });
    tokens[i] = token;
    tripIds[i] = (await trip.json()).id;
  });

  console.log("Running...");
  const end = Date.now() + SECONDS * 1000;

  const bus = async (i: number) => {
    await sleep(Math.random() * INTERVAL_MS); // spread buses over the interval
    let step = 0;
    while (Date.now() < end) {
      const next = Date.now() + INTERVAL_MS;
      const f = Math.min(1, step++ / 200); // move from Gabtoli toward Shyamoli
      const body = { lat: 23.7836 - 0.0091 * f + (i % 50) * 1e-5, lng: 90.3442 + 0.0215 * f, speedKmh: 25, recordedAt: new Date().toISOString() };
      await timed("location", `${API}/trips/${tripIds[i]}/location`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens[i]}` }, body: JSON.stringify(body) });
      await sleep(next - Date.now());
    }
  };
  const passenger = async (p: number) => {
    await sleep(Math.random() * INTERVAL_MS);
    const ip = `10.77.${Math.floor(p / 250)}.${p % 250}`; // one IP per passenger, so the 60/min limit is per person
    while (Date.now() < end) {
      const next = Date.now() + INTERVAL_MS;
      const b = 1 + Math.floor(Math.random() * BUSES);
      await timed("eta", `${API}/buses/lt-bus-${b}/eta?stoppageId=stp-motijheel`, { headers: { "x-forwarded-for": ip } });
      await sleep(next - Date.now());
    }
  };
  const t0 = Date.now();
  await Promise.all([...ids.map(bus), ...Array.from({ length: PASSENGERS }, (_, p) => passenger(p))]);
  const elapsed = (Date.now() - t0) / 1000;

  const lines = [
    `| Request | Count | Req/s | p50 ms | p95 ms | p99 ms | Max ms | Status codes |`,
    `|---|---|---|---|---|---|---|---|`,
  ];
  for (const [kind, s] of Object.entries(stats)) {
    const ms = [...s.ms].sort((a, b) => a - b);
    const r = (n: number) => Math.round(n);
    lines.push(`| ${kind === "location" ? "POST location" : "GET eta"} | ${ms.length} | ${(ms.length / elapsed).toFixed(1)} | ${r(pct(ms, 0.5))} | ${r(pct(ms, 0.95))} | ${r(pct(ms, 0.99))} | ${r(ms[ms.length - 1])} | ${Object.entries(s.codes).map(([c, n]) => `${c}: ${n}`).join(", ")} |`);
  }
  const machine = `${os.cpus()[0].model.trim()}, ${os.cpus().length} threads, ${Math.round(os.totalmem() / 1e9)} GB RAM, ${os.platform()}`;
  const report = [
    `## ${BUSES} buses + ${PASSENGERS} passengers, ${SECONDS} s`,
    ``,
    `Each bus posts a location every 5 s; each passenger requests an ETA every 5 s.`,
    `Machine: ${machine}. Server: \`next start\` (one Node process) + local PostgreSQL. Date: ${new Date().toISOString().slice(0, 10)}.`,
    ``,
    ...lines,
    ``,
  ].join("\n");
  console.log("\n" + report);
  fs.mkdirSync("docs", { recursive: true });
  fs.appendFileSync("docs/loadtest-results.md", report + "\n");
  console.log("Appended to docs/loadtest-results.md");

  await cleanup();
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
