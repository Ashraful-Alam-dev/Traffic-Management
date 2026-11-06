// npm run demo [-- --jam]
import fs from "node:fs";

if (fs.existsSync(".env")) process.loadEnvFile(".env");
const API = (process.env.API_URL ?? "http://localhost:3000") + "/api/v1";
const JAM = process.argv.includes("--jam");
const DRIVER = { email: "karim@demo.bus", password: process.env.DEMO_DRIVER_PASSWORD ?? "driver-demo-123" };
const AUTHORITY = { email: "authority@demo.bus", password: process.env.DEMO_AUTHORITY_PASSWORD ?? "authority-demo-123" };

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

const login = async (u: { email: string; password: string }) => (await call("POST", "/auth/login", u)).token as string;

async function main() {
  console.log(`API: ${API}\n`);
  const driver = await login(DRIVER);
  const authority = await login(AUTHORITY);
  console.log("1. Driver and authority logged in");

  const cur = await call("GET", "/drivers/me/trips/current", undefined, driver);
  if (cur.trip) await call("PATCH", `/trips/${cur.trip.id}/end`, undefined, driver);

  const trip = await call("POST", "/trips", { direction: "UP" }, driver);
  console.log(`2. Trip started: ${trip.id} (bus-1, Gabtoli -> Motijheel)`);

  // fake clock starting 9 min ago, so the demo runs in seconds
  let t = Date.now() - 9 * 60_000;
  let lat = 23.7836; // starts at Gabtoli
  let lng = 90.3442;
  const send = async (speedKmh: number, gapS: number) => {
    t += gapS * 1000;
    const moveM = (speedKmh / 3.6) * gapS; // move roughly towards Shyamoli
    lat -= (moveM / 111_000) * 0.4;
    lng += (moveM / 111_000) * 0.9;
    return call("POST", `/trips/${trip.id}/location`, { lat, lng, speedKmh, recordedAt: new Date(t).toISOString() }, driver);
  };
  const log = (label: string, r: { events: string[]; alertsOpened: string[] }) => {
    const extra = [...r.events.map((e) => `event ${e}`), ...r.alertsOpened.map((a) => `alert ${a}`)];
    if (extra.length) console.log(`   ${label}: ${extra.join(", ")}`);
  };

  console.log("3. Normal driving (30 km/h)");
  for (let i = 0; i < 5; i++) await send(30, 5);
  await send(40, 3);

  console.log("4. Harsh brake: 40 -> 5 km/h in 3 s");
  log("brake", await send(5, 3));
  await send(30, 5);

  console.log("5. Overspeed: 75 km/h for 15 s");
  for (let i = 0; i < 6; i++) await send(75, 3);
  log("slow down", await send(40, 3));

  console.log("6. Stop for 65 s away from any stoppage");
  await send(20, 3);
  for (let i = 0; i < 14; i++) log("stopped", await send(0, 5));

  if (JAM) {
    console.log("6b. Still stopped, reaches 3 min -> becomes a JAM, stop penalty cancelled");
    for (let i = 0; i < 25; i++) log("jam", await send(0, 5));
  }
  log("moving again", await send(25, 5));

  const eta = await call("GET", `/buses/bus-1/eta?stoppageId=stp-farmgate`);
  console.log(`7. Passenger ETA to Farmgate: ${eta.eta ? `${eta.eta.seconds} s (${eta.confidence})` : eta.reason}`);

  const alerts = await call("GET", "/alerts", undefined, authority);
  const mine = alerts.alerts.filter((a: { tripId: string }) => a.tripId === trip.id);
  console.log(`8. Authority sees ${mine.length} alert(s) for this trip:`);
  for (const a of mine) console.log(`   ${a.type} ${a.status}`);

  const ended = await call("PATCH", `/trips/${trip.id}/end`, undefined, driver);
  const events = await call("GET", `/trips/${trip.id}/events`, undefined, authority);
  console.log(`9. Trip ended. Score: ${ended.score} (distance ${ended.distanceKm} km)`);
  for (const e of events.events) console.log(`   ${e.type} -${e.penalty}${e.cancelled ? " (cancelled: jam)" : ""}`);

  const rating = await call("GET", "/drivers/me/rating", undefined, driver);
  console.log(`10. Driver rating: ${rating.rating} (${rating.stars} stars, ${rating.tripsCounted} trips)`);
}

main().catch((e) => {
  console.error("Demo failed:", e.message);
  process.exit(1);
});
