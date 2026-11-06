import { describe, expect, it } from "vitest";
import { detect, type DetectorState, type Point } from "@/lib/geo/detectors";

const t0 = new Date("2026-01-01T10:00:00Z").getTime();
const pt = (s: number, speedKmh: number, lat = 23.75, lng = 90.39): Point => ({ lat, lng, speedKmh, recordedAt: new Date(t0 + s * 1000) });

function run(points: Point[], near = false) {
  let state: DetectorState | null = null;
  const all = { events: [] as ReturnType<typeof detect>["events"], open: [] as string[], resolve: [] as string[], cancels: 0, km: 0 };
  for (const p of points) {
    const r = detect(state, p, near);
    state = r.state;
    all.events.push(...r.events);
    all.open.push(...r.openAlerts);
    all.resolve.push(...r.resolveAlerts);
    if (r.cancelStopEventsSince) all.cancels++;
    all.km += r.addDistanceKm;
  }
  return { ...all, state };
}

describe("harsh brake", () => {
  it("40 -> 5 km/h in 3 s is harsh (3.24 m/s^2)", () => {
    const r = run([pt(0, 40), pt(3, 5)]);
    expect(r.events.map((e) => e.type)).toEqual(["HARSH_BRAKE"]);
    expect(r.events[0].penalty).toBe(5);
  });
  it("gentle braking is not", () => expect(run([pt(0, 40), pt(5, 20)]).events).toHaveLength(0));
  it("ignores gaps over 10 s", () => expect(run([pt(0, 60), pt(12, 0)]).events).toHaveLength(0));
  it("cooldown: one per 30 s", () => {
    const r = run([pt(0, 40), pt(3, 5), pt(6, 40), pt(9, 5), pt(40, 45), pt(43, 5)]);
    expect(r.events.filter((e) => e.type === "HARSH_BRAKE")).toHaveLength(2);
  });
});

describe("overspeed", () => {
  it("75 km/h for 15 s counts once, when the episode closes", () => {
    const pts = [pt(0, 75), pt(3, 75), pt(6, 75), pt(9, 75), pt(12, 75), pt(15, 75)];
    const open = run(pts);
    expect(open.events).toHaveLength(0); // still in the episode
    const r = run([...pts, pt(18, 50)]);
    const ev = r.events.filter((e) => e.type === "OVERSPEED");
    expect(ev).toHaveLength(1);
    expect(ev[0].penalty).toBe(5);
    expect(ev[0].value).toBe(75);
  });
  it("under 10 s does not count", () => expect(run([pt(0, 75), pt(6, 75), pt(9, 50)]).events).toHaveLength(0));
  it("max > 80 km/h gives penalty 10 and a severe alert", () => {
    const r = run([pt(0, 70), pt(5, 85), pt(10, 85), pt(13, 50)]);
    expect(r.events.find((e) => e.type === "OVERSPEED")?.penalty).toBe(10);
    expect(r.open).toContain("SEVERE_OVERSPEED");
    expect(r.resolve).toContain("SEVERE_OVERSPEED");
  });
});

describe("unscheduled stop and jam", () => {
  const stop = (from: number, to: number) => {
    const p: Point[] = [];
    for (let s = from; s <= to; s += 5) p.push(pt(s, 0));
    return p;
  };

  it("stop >= 60 s away from stoppages: event + alert", () => {
    const r = run([pt(0, 30), ...stop(5, 70)]);
    expect(r.events.filter((e) => e.type === "UNSCHEDULED_STOP")).toHaveLength(1);
    expect(r.open).toEqual(["UNSCHEDULED_STOP"]);
  });
  it("no event near a stoppage", () => expect(run([pt(0, 30), ...stop(5, 70)], true).events).toHaveLength(0));
  it("moving again resolves the alert", () => expect(run([pt(0, 30), ...stop(5, 70), pt(75, 20)]).resolve).toContain("UNSCHEDULED_STOP"));
  it("stop reaching 3 min becomes a jam and cancels the stop penalty", () => {
    const r = run([pt(0, 30), ...stop(5, 190)]);
    expect(r.open).toEqual(["UNSCHEDULED_STOP", "JAM"]);
    expect(r.cancels).toBe(1);
    expect(r.resolve).toContain("UNSCHEDULED_STOP");
  });
});

describe("distance", () => {
  it("adds real movement", () => {
    const r = run([pt(0, 30, 23.75, 90.39), pt(10, 30, 23.7508, 90.39)]); // ~89 m
    expect(r.km).toBeGreaterThan(0.08);
  });
  it("ignores jitter under 10 m and GPS jumps", () => {
    expect(run([pt(0, 0, 23.75, 90.39), pt(5, 0, 23.75005, 90.39)]).km).toBe(0); // ~5 m
    expect(run([pt(0, 30, 23.75, 90.39), pt(3, 30, 23.8, 90.39)]).km).toBe(0); // 5.5 km in 3 s
  });
});
