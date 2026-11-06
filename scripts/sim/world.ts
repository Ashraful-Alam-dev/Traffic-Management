// Fake Dhaka traffic for the simulators: slow rush hours, Farmgate/Shahbag bottlenecks.

export type LatLng = { lat: number; lng: number };
export type SimStop = LatLng & { id: string; name: string };
export type SimPoint = LatLng & { speedKmh: number; t: number; label?: string };
export type Profile = "careful" | "normal" | "aggressive" | "jammed";

// seeded so runs are repeatable
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FREE_FLOW_KMH = 32;

function hourFactor(hour: number): number {
  if (hour >= 8 && hour <= 10) return 0.4; // morning rush
  if (hour >= 17 && hour <= 20) return 0.35; // evening rush
  if (hour >= 11 && hour <= 16) return 0.7;
  if (hour >= 21 || hour <= 6) return 1.1;
  return 0.6;
}

function stretchFactor(fromId: string, toId: string): number {
  const key = [fromId, toId].sort().join();
  if (key.includes("stp-farmgate") && key.includes("stp-shahbag")) return 0.5;
  if (key.includes("stp-farmgate")) return 0.65;
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 0.8 + (h % 40) / 100; // 0.8 - 1.2
}

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
export function distM(a: LatLng, b: LatLng) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const lerp = (a: LatLng, b: LatLng, f: number): LatLng => ({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f });

export function* tripPoints(opts: {
  stops: SimStop[];
  startMs: number;
  hour: number;
  profile: Profile;
  seed: number;
  dtS: number;
}): Generator<SimPoint> {
  const { stops, profile, dtS } = opts;
  const rand = rng(opts.seed);
  let t = opts.startMs;
  const emit = (p: LatLng, speedKmh: number, label?: string): SimPoint => ({ ...p, speedKmh: Math.max(0, Math.round(speedKmh * 10) / 10), t, label });

  for (let k = 0; k < stops.length - 1; k++) {
    const a = stops[k];
    const b = stops[k + 1];
    const len = distM(a, b);

    for (let s = 0; s < 20; s += dtS) {
      yield emit(a, 0);
      t += dtS * 1000;
    }

    const noise = 0.85 + rand() * 0.3;
    let cruise = FREE_FLOW_KMH * hourFactor(opts.hour) * stretchFactor(a.id, b.id) * noise;
    if (profile === "careful") cruise = Math.min(cruise, 40);
    if (profile === "aggressive") cruise *= 1.1;

    let done = 0;
    let speed = Math.min(cruise, 15);
    let burstLeftS = 0;
    let brakeNext = false;
    let jamLeftS = profile === "jammed" && k === 0 ? 200 : 0; // stuck 200 s mid-stretch
    let jamAt = len * 0.5;

    while (done < len) {
      let label: string | undefined;
      if (jamLeftS > 0 && done >= jamAt) {
        speed = 0;
        jamLeftS -= dtS;
        label = "stuck in traffic";
        if (jamLeftS <= 0) jamAt = Infinity;
      } else if (brakeNext) {
        speed = 5; // 40+ -> 5 km/h within one gap: harsh
        brakeNext = false;
        label = "harsh brake";
      } else if (burstLeftS > 0) {
        speed = 78 + rand() * 6;
        burstLeftS -= dtS;
        if (burstLeftS <= 0) brakeNext = true;
        label = "speeding";
      } else {
        const burstChance = profile === "aggressive" ? 0.012 : profile === "normal" ? 0.0015 : 0;
        if (rand() < burstChance * dtS / 5 && len - done > 400) burstLeftS = 15;
        speed += (cruise - speed) * 0.5 + (rand() - 0.5) * 4;
      }
      done += (speed / 3.6) * dtS;
      yield emit(lerp(a, b, Math.min(1, done / len)), speed, label);
      t += dtS * 1000;
    }
  }
  yield emit(stops[stops.length - 1], 0);
}
