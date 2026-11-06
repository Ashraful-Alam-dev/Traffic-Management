// npm run simulate
// Karim drives carefully, Rahim speeds and brakes hard, Salam gets stuck in a jam.
import fs from "node:fs";
import { tripPoints, type Profile, type SimStop } from "./sim/world";

if (fs.existsSync(".env")) process.loadEnvFile(".env");
const API = (process.env.API_URL ?? "http://localhost:3000") + "/api/v1";
const PW = process.env.DEMO_DRIVER_PASSWORD ?? "driver-demo-123";
const DT_S = 3;

const BUSES: { email: string; name: string; busId: string; routeId: string; profile: Profile }[] = [
  { email: "karim@demo.bus", name: "Karim (careful)", busId: "bus-1", routeId: "route-1", profile: "careful" },
  { email: "rahim@demo.bus", name: "Rahim (aggressive)", busId: "bus-2", routeId: "route-1", profile: "aggressive" },
  { email: "salam@demo.bus", name: "Salam (jammed)", busId: "bus-3", routeId: "route-2", profile: "jammed" },
];

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const time = () => new Date().toLocaleTimeString("en-GB");

async function runBus(b: (typeof BUSES)[number]) {
  const token = (await call("POST", "/auth/login", { email: b.email, password: PW })).token;
  const cur = await call("GET", "/drivers/me/trips/current", undefined, token);
  if (cur.trip) await call("PATCH", `/trips/${cur.trip.id}/end`, undefined, token);

  const stops: SimStop[] = (await call("GET", `/routes/${b.routeId}/stoppages`)).stoppages;
  const trip = await call("POST", "/trips", { direction: "UP" }, token);
  const dest = stops[stops.length - 1];
  console.log(`[${time()}] ${b.name}: trip started on ${b.busId}, ${stops[0].name} -> ${dest.name}`);

  const hour = (new Date().getUTCHours() + 6) % 24;
  let lastLabel: string | undefined;
  let n = 0;
  for (const p of tripPoints({ stops, startMs: Date.now(), hour, profile: b.profile, seed: Date.now() % 100000, dtS: DT_S })) {
    const wait = p.t - Date.now();
    if (wait > 0) await sleep(wait);
    const r = await call("POST", `/trips/${trip.id}/location`, { lat: p.lat, lng: p.lng, speedKmh: p.speedKmh, recordedAt: new Date(p.t).toISOString() }, token);
    if (p.label && p.label !== lastLabel) console.log(`[${time()}] ${b.name}: ${p.label} (${p.speedKmh} km/h)`);
    lastLabel = p.label;
    for (const e of r.events) console.log(`[${time()}] ${b.name}: EVENT ${e}`);
    for (const a of r.alertsOpened) console.log(`[${time()}] ${b.name}: ALERT ${a}`);
    if (++n % 20 === 0) {
      const eta = await call("GET", `/buses/${b.busId}/eta?stoppageId=${dest.id}`);
      if (eta.eta) console.log(`[${time()}] ${b.name}: ETA to ${dest.name} ${Math.round(eta.eta.seconds / 60)} min (${eta.method}, ${eta.confidence})`);
    }
  }
  const ended = await call("PATCH", `/trips/${trip.id}/end`, undefined, token);
  const rating = await call("GET", "/drivers/me/rating", undefined, token);
  console.log(`[${time()}] ${b.name}: arrived. Trip score ${ended.score}, rating ${rating.rating ?? "n/a"} (${rating.stars ?? "-"} stars)`);
}

console.log(`Live simulation against ${API}. Ctrl+C to stop.\n`);
Promise.all(BUSES.map((b) => runBus(b).catch((e) => console.error(`${b.name} stopped: ${e.message}`)))).then(() => console.log("\nAll buses arrived."));
