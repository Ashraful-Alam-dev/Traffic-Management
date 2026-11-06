import { T } from "@/lib/config/thresholds";
import { haversineM, kmhToMps, type LatLng } from "./index";

export type Point = { lat: number; lng: number; speedKmh: number; recordedAt: Date };

export type DetectorState = {
  lat: number;
  lng: number;
  speedKmh: number;
  recordedAt: Date;
  stoppedSince: Date | null;
  slowSince: Date | null;
  overspeedSince: Date | null;
  overspeedMaxKmh: number | null;
  lastHarshBrakeAt: Date | null;
};

export type NewEvent = {
  type: "HARSH_BRAKE" | "OVERSPEED" | "UNSCHEDULED_STOP";
  severity: "MEDIUM" | "HIGH";
  value: number;
  penalty: number;
  lat: number;
  lng: number;
  occurredAt: Date;
};

export type AlertType = "UNSCHEDULED_STOP" | "JAM" | "SEVERE_OVERSPEED";

export type DetectResult = {
  state: DetectorState;
  events: NewEvent[];
  openAlerts: AlertType[];
  resolveAlerts: AlertType[];
  cancelStopEventsSince: Date | null; // stop became a jam: cancel stop penalties since this time
  addDistanceKm: number;
};

const sec = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 1000;

// prev is null on the first point of a trip
export function detect(prev: DetectorState | null, p: Point, nearStoppage: boolean): DetectResult {
  const events: NewEvent[] = [];
  const openAlerts: AlertType[] = [];
  const resolveAlerts: AlertType[] = [];
  let cancelStopEventsSince: Date | null = null;
  let addDistanceKm = 0;
  const t = p.recordedAt;
  const at = { lat: p.lat, lng: p.lng };

  const state: DetectorState = {
    lat: p.lat,
    lng: p.lng,
    speedKmh: p.speedKmh,
    recordedAt: t,
    stoppedSince: prev?.stoppedSince ?? null,
    slowSince: prev?.slowSince ?? null,
    overspeedSince: prev?.overspeedSince ?? null,
    overspeedMaxKmh: prev?.overspeedMaxKmh ?? null,
    lastHarshBrakeAt: prev?.lastHarshBrakeAt ?? null,
  };

  // distance: ignore GPS jitter and jumps
  if (prev) {
    const d = haversineM(prev, p);
    const gap = sec(t, prev.recordedAt);
    if (gap > 0 && d >= T.MIN_MOVE_M && (d / gap) * 3.6 <= T.MAX_IMPLIED_KMH) addDistanceKm = d / 1000;
  }

  if (prev) {
    const gap = sec(t, prev.recordedAt);
    if (gap >= T.HARSH_BRAKE_MIN_GAP_S && gap <= T.HARSH_BRAKE_MAX_GAP_S) {
      const decel = (kmhToMps(prev.speedKmh) - kmhToMps(p.speedKmh)) / gap;
      const coolOk = !state.lastHarshBrakeAt || sec(t, state.lastHarshBrakeAt) >= T.HARSH_BRAKE_COOLDOWN_S;
      if (decel >= T.HARSH_BRAKE_MPS2 && coolOk) {
        events.push({
          type: "HARSH_BRAKE",
          severity: decel >= 5 ? "HIGH" : "MEDIUM",
          value: round2(decel),
          penalty: T.HARSH_BRAKE_PENALTY,
          ...at,
          occurredAt: t,
        });
        state.lastHarshBrakeAt = t;
      }
    }
  }

  // overspeed: one event per episode, written when it ends
  if (p.speedKmh > T.SPEED_LIMIT_KMH) {
    state.overspeedSince ??= t;
    state.overspeedMaxKmh = Math.max(state.overspeedMaxKmh ?? 0, p.speedKmh);
    const lasted = sec(t, state.overspeedSince) >= T.OVERSPEED_MIN_S;
    if (lasted && state.overspeedMaxKmh > T.SPEED_LIMIT_KMH + T.SEVERE_OVER_KMH) openAlerts.push("SEVERE_OVERSPEED");
  } else if (state.overspeedSince && prev) {
    const ev = closeOverspeed(state, prev.recordedAt, prev);
    if (ev) events.push(ev);
    resolveAlerts.push("SEVERE_OVERSPEED");
  }

  if (p.speedKmh < T.STOP_SPEED_KMH) {
    const wasStopped = state.stoppedSince !== null;
    state.stoppedSince ??= t;
    const before = wasStopped && prev ? sec(prev.recordedAt, state.stoppedSince) : -1;
    const now = sec(t, state.stoppedSince);
    if (before < T.STOP_MIN_S && now >= T.STOP_MIN_S && !nearStoppage) {
      events.push({
        type: "UNSCHEDULED_STOP",
        severity: "MEDIUM",
        value: Math.round(now),
        penalty: T.STOP_PENALTY,
        ...at,
        occurredAt: t,
      });
      openAlerts.push("UNSCHEDULED_STOP");
    }
  } else if (state.stoppedSince) {
    state.stoppedSince = null;
    resolveAlerts.push("UNSCHEDULED_STOP");
  }

  // jam: no penalty, and it cancels the stop penalty (traffic isn't the driver's fault)
  if (p.speedKmh < T.JAM_SPEED_KMH) {
    const wasSlow = state.slowSince !== null;
    state.slowSince ??= t;
    const before = wasSlow && prev ? sec(prev.recordedAt, state.slowSince) : -1;
    const now = sec(t, state.slowSince);
    if (before < T.JAM_MIN_S && now >= T.JAM_MIN_S && !nearStoppage) {
      openAlerts.push("JAM");
      cancelStopEventsSince = state.slowSince;
      resolveAlerts.push("UNSCHEDULED_STOP");
    }
  } else if (state.slowSince) {
    state.slowSince = null;
    resolveAlerts.push("JAM");
  }

  return { state, events, openAlerts, resolveAlerts, cancelStopEventsSince, addDistanceKm };
}

export function closeOverspeed(state: DetectorState, lastOverAt: Date, where: LatLng): NewEvent | null {
  if (!state.overspeedSince) return null;
  const max = state.overspeedMaxKmh ?? 0;
  const lasted = sec(lastOverAt, state.overspeedSince) >= T.OVERSPEED_MIN_S;
  const since = state.overspeedSince;
  state.overspeedSince = null;
  state.overspeedMaxKmh = null;
  if (!lasted) return null;
  const severe = max > T.SPEED_LIMIT_KMH + T.SEVERE_OVER_KMH;
  return {
    type: "OVERSPEED",
    severity: severe ? "HIGH" : "MEDIUM",
    value: max,
    penalty: severe ? T.SEVERE_OVERSPEED_PENALTY : T.OVERSPEED_PENALTY,
    lat: where.lat,
    lng: where.lng,
    occurredAt: since,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
