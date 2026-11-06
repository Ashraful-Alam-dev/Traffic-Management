import { T } from "@/lib/config/thresholds";
import { haversineM, type LatLng } from "./index";

export type Stop = LatLng & { id: string };

// A stop counts as passed within 50 m, or once the bus is closer to the following stop.
export function advanceNextStop(stops: Stop[], nextIdx: number, p: LatLng): number {
  let i = Math.max(0, nextIdx);
  while (i < stops.length) {
    const stop = stops[i];
    if (haversineM(p, stop) <= T.STOPPAGE_RADIUS_M) {
      i++;
      continue;
    }
    const after = stops[i + 1];
    if (after && haversineM(p, after) < haversineM(stop, after)) {
      i++;
      continue;
    }
    break;
  }
  return i;
}

export type EtaResult =
  | { eta: { seconds: number; distanceM: number; speedKmh: number }; reason: null }
  | { eta: null; reason: "STOP_PASSED" | "STOP_NOT_ON_ROUTE" };

export function computeEta(stops: Stop[], nextIdx: number, bus: LatLng, targetId: string, recentSpeeds: number[]): EtaResult {
  const j = stops.findIndex((s) => s.id === targetId);
  if (j === -1) return { eta: null, reason: "STOP_NOT_ON_ROUTE" };
  if (j < nextIdx || nextIdx >= stops.length) return { eta: null, reason: "STOP_PASSED" };

  let dist = haversineM(bus, stops[nextIdx]);
  for (let k = nextIdx; k < j; k++) dist += haversineM(stops[k], stops[k + 1]);

  const samples = recentSpeeds.slice(0, T.ETA_SPEED_SAMPLES);
  const avg = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
  const speedKmh = Math.max(avg, T.ETA_MIN_SPEED_KMH);
  return {
    eta: { seconds: Math.round(dist / (speedKmh / 3.6)), distanceM: Math.round(dist), speedKmh: Math.round(speedKmh * 10) / 10 },
    reason: null,
  };
}

export type SegmentHistory = Map<string, { avgS: number; samples: number }>;
export const segKey = (fromId: string, toId: string) => `${fromId}>${toId}`;

export function computeEtaWithHistory(
  stops: Stop[],
  nextIdx: number,
  bus: LatLng,
  targetId: string,
  recentSpeeds: number[],
  history: SegmentHistory,
): EtaResult & { method: "LIVE" | "HISTORY" } {
  const live = computeEta(stops, nextIdx, bus, targetId, recentSpeeds);
  if (!live.eta) return { ...live, method: "LIVE" };

  const j = stops.findIndex((s) => s.id === targetId);
  const mps = live.eta.speedKmh / 3.6;
  const toNext = haversineM(bus, stops[nextIdx]);
  let seconds = toNext / mps;
  let usedHistory = false;

  // stretch the bus is on: past time scaled by the part still left
  const prevStop = stops[nextIdx - 1];
  const cur = prevStop && history.get(segKey(prevStop.id, stops[nextIdx].id));
  if (cur && cur.samples >= T.ETA_HISTORY_MIN_SAMPLES) {
    const share = Math.min(1, toNext / Math.max(1, haversineM(prevStop, stops[nextIdx])));
    seconds = cur.avgS * share;
    usedHistory = true;
  }
  for (let k = nextIdx; k < j; k++) {
    const h = history.get(segKey(stops[k].id, stops[k + 1].id));
    if (h && h.samples >= T.ETA_HISTORY_MIN_SAMPLES) {
      seconds += h.avgS;
      usedHistory = true;
    } else {
      seconds += haversineM(stops[k], stops[k + 1]) / mps;
    }
  }
  return {
    eta: { ...live.eta, seconds: Math.round(seconds) },
    reason: null,
    method: usedHistory ? "HISTORY" : "LIVE",
  };
}

export function etaConfidence(lastUpdate: Date, now = new Date()): "HIGH" | "MEDIUM" | "LOW" {
  const age = now.getTime() - lastUpdate.getTime();
  if (age < T.ETA_HIGH_CONF_MS) return "HIGH";
  if (age < T.ETA_MEDIUM_CONF_MS) return "MEDIUM";
  return "LOW";
}

export function orderStops<S extends { stopOrder: number }>(stops: S[], direction: "UP" | "DOWN"): S[] {
  const s = [...stops].sort((a, b) => a.stopOrder - b.stopOrder);
  return direction === "UP" ? s : s.reverse();
}
