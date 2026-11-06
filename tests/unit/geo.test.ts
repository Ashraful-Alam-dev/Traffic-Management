import { describe, expect, it } from "vitest";
import { haversineM, isNearAny } from "@/lib/geo";
import { driverRating, tripScore } from "@/lib/geo/score";
import { advanceNextStop, computeEta, computeEtaWithHistory, etaConfidence, orderStops, segKey } from "@/lib/geo/eta";

const farmgate = { lat: 23.7577, lng: 90.3897 };
const shahbag = { lat: 23.7389, lng: 90.3958 };

describe("haversine", () => {
  it("is zero for the same point", () => expect(haversineM(farmgate, farmgate)).toBe(0));
  it("Farmgate to Shahbag is about 2.2 km", () => {
    const d = haversineM(farmgate, shahbag);
    expect(d).toBeGreaterThan(2100);
    expect(d).toBeLessThan(2300);
  });
  it("near check uses the radius", () => {
    expect(isNearAny({ lat: 23.7579, lng: 90.3897 }, [farmgate], 50)).toBe(true); // ~22 m
    expect(isNearAny({ lat: 23.7590, lng: 90.3897 }, [farmgate], 50)).toBe(false); // ~145 m
  });
});

describe("trip score", () => {
  it("subtracts penalties, ignoring cancelled ones", () => {
    expect(
      tripScore([
        { penalty: 5, cancelled: false },
        { penalty: 10, cancelled: false },
        { penalty: 10, cancelled: true },
      ]),
    ).toBe(85);
  });
  it("never goes below 0", () => expect(tripScore(Array(30).fill({ penalty: 10, cancelled: false }))).toBe(0));
  it("is 100 with no events", () => expect(tripScore([])).toBe(100));
});

describe("driver rating", () => {
  it("needs at least 5 trips", () => {
    expect(driverRating([90, 80, 70, 60])).toEqual({ status: "NOT_ENOUGH_DATA", rating: null, stars: null, tripsCounted: 4 });
  });
  it("averages and converts to stars", () => {
    const r = driverRating([95, 80, 100, 70, 85, 90]);
    expect(r).toEqual({ status: "OK", rating: 86.67, stars: 4.3, tripsCounted: 6 });
  });
  it("uses only the latest 30 trips", () => {
    const r = driverRating([...Array(30).fill(100), ...Array(10).fill(0)]);
    expect(r.rating).toBe(100);
    expect(r.tripsCounted).toBe(30);
  });
});

describe("ETA", () => {
  const raw = [
    { id: "a", stopOrder: 1, lat: 23.7745, lng: 90.3657 }, // Shyamoli
    { id: "b", stopOrder: 2, lat: 23.7577, lng: 90.3897 }, // Farmgate
    { id: "c", stopOrder: 3, lat: 23.7389, lng: 90.3958 }, // Shahbag
  ];

  it("orders stops by direction", () => {
    expect(orderStops(raw, "UP").map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(orderStops(raw, "DOWN").map((s) => s.id)).toEqual(["c", "b", "a"]);
  });

  it("advances past a stop the bus has reached and never goes back", () => {
    const up = orderStops(raw, "UP");
    expect(advanceNextStop(up, 0, { lat: 23.7745, lng: 90.3657 })).toBe(1); // at Shyamoli
    const between = { lat: 23.75, lng: 90.392 }; // between Farmgate and Shahbag
    expect(advanceNextStop(up, 1, between)).toBe(2);
    expect(advanceNextStop(up, 2, { lat: 23.7745, lng: 90.3657 })).toBe(2); // GPS back at start: no regression
  });

  it("computes distance along stops and uses the speed floor", () => {
    const up = orderStops(raw, "UP");
    const r = computeEta(up, 1, { lat: 23.7745, lng: 90.3657 }, "c", [0, 0, 0]);
    expect(r.reason).toBeNull();
    if (r.eta) {
      expect(r.eta.speedKmh).toBe(8);
      expect(r.eta.distanceM).toBeGreaterThan(4500);
    }
  });

  it("returns a reason for passed or unknown stops", () => {
    const up = orderStops(raw, "UP");
    expect(computeEta(up, 2, farmgate, "a", [30]).reason).toBe("STOP_PASSED");
    expect(computeEta(up, 0, farmgate, "zzz", [30]).reason).toBe("STOP_NOT_ON_ROUTE");
  });

  it("history ETA uses past stretch times when there are enough samples", () => {
    const up = orderStops(raw, "UP");
    const atA = { lat: 23.7745, lng: 90.3657 };
    const none = computeEtaWithHistory(up, 0, atA, "c", [20], new Map());
    expect(none.method).toBe("LIVE");

    const hist = new Map([
      [segKey("a", "b"), { avgS: 900, samples: 5 }],
      [segKey("b", "c"), { avgS: 600, samples: 2 }], // too few samples: falls back to live speed
    ]);
    const r = computeEtaWithHistory(up, 0, atA, "c", [20], hist);
    expect(r.method).toBe("HISTORY");
    const liveBC = computeEta(up, 1, up[1], "c", [20]).eta!.seconds; // b -> c at live speed
    expect(r.eta!.seconds).toBe(900 + liveBC);
  });

  it("history ETA scales the current stretch by the share still to drive", () => {
    const up = orderStops(raw, "UP");
    const halfway = { lat: (up[0].lat + up[1].lat) / 2, lng: (up[0].lng + up[1].lng) / 2 };
    const hist = new Map([[segKey("a", "b"), { avgS: 600, samples: 4 }]]);
    const r = computeEtaWithHistory(up, 1, halfway, "b", [20], hist);
    expect(r.method).toBe("HISTORY");
    expect(r.eta!.seconds).toBeGreaterThanOrEqual(295);
    expect(r.eta!.seconds).toBeLessThanOrEqual(305);
  });

  it("confidence depends on last update age", () => {
    const now = new Date("2026-01-01T10:00:00Z");
    expect(etaConfidence(new Date(now.getTime() - 10_000), now)).toBe("HIGH");
    expect(etaConfidence(new Date(now.getTime() - 60_000), now)).toBe("MEDIUM");
    expect(etaConfidence(new Date(now.getTime() - 300_000), now)).toBe("LOW");
  });
});
