import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { call, hasDb, resetAndSeed } from "./helpers";
import * as login from "@/app/api/v1/auth/login/route";
import * as trips from "@/app/api/v1/trips/route";
import * as location from "@/app/api/v1/trips/[id]/location/route";
import * as eta from "@/app/api/v1/buses/[id]/eta/route";
import * as accuracy from "@/app/api/v1/analytics/eta-accuracy/route";

const token = async (email: string) => (await call(login.POST, { method: "POST", body: { email, password: "pw" } })).body.token as string;

describe.skipIf(!hasDb)("ETA accuracy", () => {
  let d1: string;
  let auth: string;
  beforeAll(async () => {
    await resetAndSeed();
    d1 = await token("d1@test.bus");
    auth = await token("a@test.bus");
  });

  it("records arrivals and scores logged ETAs against them", async () => {
    const id = (await call(trips.POST, { method: "POST", body: { direction: "UP" }, token: d1 })).body.id;
    const from = { lat: 23.7745, lng: 90.3657 }; // s1 Shyamoli
    const to = { lat: 23.7577, lng: 90.3897 }; // s2 Farmgate
    const steps = 60;
    let t = Date.now() - 9 * 60_000;

    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const body = { lat: from.lat + (to.lat - from.lat) * f, lng: from.lng + (to.lng - from.lng) * f, speedKmh: 30, recordedAt: new Date(t).toISOString() };
      const r = await call(location.POST, { method: "POST", id, token: d1, body });
      expect(r.status).toBe(201);
      if (i % 10 === 5) {
        const e = await call(eta.GET, { path: "/buses/b1/eta?stoppageId=s2", id: "b1" });
        expect(e.body.method).toBe("LIVE"); // no history yet
      }
      t += 5000;
    }

    const arrivals = await prisma.stopArrival.findMany({ where: { tripId: id }, orderBy: { stopIndex: "asc" } });
    expect(arrivals.map((a) => a.stoppageId)).toEqual(["s1", "s2"]);

    const acc = await call(accuracy.GET, { path: "/analytics/eta-accuracy", token: auth });
    expect(acc.status).toBe(200);
    expect(acc.body.live.overall.predictions).toBeGreaterThan(0);
    expect(acc.body.live.overall.meanAbsErrorS).toBeGreaterThanOrEqual(0);
  });

  it("accuracy endpoint is authority only", async () => {
    expect((await call(accuracy.GET, { path: "/analytics/eta-accuracy", token: d1 })).status).toBe(403);
  });
});
