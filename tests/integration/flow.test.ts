import { beforeAll, describe, expect, it } from "vitest";
import { call, hasDb, resetAndSeed } from "./helpers";
import * as login from "@/app/api/v1/auth/login/route";
import * as trips from "@/app/api/v1/trips/route";
import * as location from "@/app/api/v1/trips/[id]/location/route";
import * as end from "@/app/api/v1/trips/[id]/end/route";
import * as tripEvents from "@/app/api/v1/trips/[id]/events/route";
import * as alerts from "@/app/api/v1/alerts/route";
import * as bus from "@/app/api/v1/buses/[id]/route";
import * as eta from "@/app/api/v1/buses/[id]/eta/route";
import * as driverTrips from "@/app/api/v1/drivers/[id]/trips/route";
import * as abandon from "@/app/api/v1/internal/abandon-trips/route";

const token = async (email: string) => (await call(login.POST, { method: "POST", body: { email, password: "pw" } })).body.token as string;

describe.skipIf(!hasDb)("trip lifecycle", () => {
  let d1: string;
  let auth: string;
  beforeAll(async () => {
    await resetAndSeed();
    d1 = await token("d1@test.bus");
    auth = await token("a@test.bus");
  });

  it("start, post points with events, end, score", async () => {
    const start = await call(trips.POST, { method: "POST", body: { direction: "UP" }, token: d1 });
    expect(start.status).toBe(201);
    const id = start.body.id;

    expect((await call(trips.POST, { method: "POST", body: { direction: "UP" }, token: d1 })).status).toBe(409);

    let t = Date.now() - 5 * 60_000;
    const post = (speedKmh: number, gap: number, lat = 23.765, lng = 90.378) => {
      t += gap * 1000;
      return call(location.POST, { method: "POST", id, token: d1, body: { lat, lng, speedKmh, recordedAt: new Date(t).toISOString() } });
    };

    expect((await post(40, 0)).status).toBe(201);
    const brake = await post(5, 3);
    expect(brake.body.events).toContain("HARSH_BRAKE");

    // Retry of the same point: 200, nothing new.
    const dupTime = new Date(t).toISOString();
    const dup = await call(location.POST, { method: "POST", id, token: d1, body: { lat: 23.765, lng: 90.378, speedKmh: 5, recordedAt: dupTime } });
    expect(dup.status).toBe(200);
    expect(dup.body.duplicate).toBe(true);

    // Under 2 s apart: 429.
    t += 1000;
    const fast = await call(location.POST, { method: "POST", id, token: d1, body: { lat: 23.765, lng: 90.378, speedKmh: 5, recordedAt: new Date(t).toISOString() } });
    expect(fast.status).toBe(429);

    // Late point: stored but not applied.
    const late = await call(location.POST, {
      method: "POST", id, token: d1,
      body: { lat: 23.765, lng: 90.378, speedKmh: 90, recordedAt: new Date(t - 60_000).toISOString() },
    });
    expect(late.body.applied).toBe(false);

    // Stop 65 s away from stoppages.
    for (let i = 0; i < 14; i++) await post(0, 5);
    const open = await call(alerts.GET, { path: "/alerts?status=OPEN", token: auth });
    expect(open.body.alerts.map((a: { type: string }) => a.type)).toContain("UNSCHEDULED_STOP");

    const e = await call(eta.GET, { path: "/buses/b1/eta?stoppageId=s3", id: "b1" });
    expect(e.status).toBe(200);
    expect(e.body.eta?.seconds).toBeGreaterThan(0);

    const done = await call(end.PATCH, { method: "PATCH", id, token: d1 });
    expect(done.status).toBe(200);
    expect(done.body.score).toBe(85); // 100 - 5 (brake) - 10 (stop)
    expect(done.body.provisional).toBe(false);

    const ev = await call(tripEvents.GET, { id, token: auth });
    expect(ev.body.events).toHaveLength(2);
  });

  it("cron endpoint needs the secret", async () => {
    expect((await call(abandon.POST, { method: "POST" })).status).toBe(401);
  });
});

describe.skipIf(!hasDb)("role access", () => {
  let d1: string;
  let d2: string;
  beforeAll(async () => {
    await resetAndSeed();
    d1 = await token("d1@test.bus");
    d2 = await token("d2@test.bus");
  });

  it("a driver cannot post to another driver's trip", async () => {
    const trip = (await call(trips.POST, { method: "POST", body: { direction: "UP" }, token: d1 })).body;
    const r = await call(location.POST, {
      method: "POST", id: trip.id, token: d2,
      body: { lat: 23.76, lng: 90.38, speedKmh: 10, recordedAt: new Date().toISOString() },
    });
    expect(r.status).toBe(403);
  });

  it("a driver cannot use authority endpoints to read others' data", async () => {
    expect((await call(driverTrips.GET, { id: "d1", token: d2 })).status).toBe(403);
  });

  it("a passenger (no token) cannot see alerts", async () => {
    expect((await call(alerts.GET, {})).status).toBe(401);
  });

  it("passenger bus view has no driver personal data", async () => {
    const r = await call(bus.GET, { id: "b1" });
    expect(r.status).toBe(200);
    expect(r.body.driver).toEqual({ displayName: "D1", stars: null });
    expect(JSON.stringify(r.body)).not.toContain("Driver Full Name");
  });
});
