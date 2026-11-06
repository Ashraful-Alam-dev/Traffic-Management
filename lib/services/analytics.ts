import { prisma } from "@/lib/db";

type Row = { tripId: string; stoppageId: string; minuteBucket: number; method: "LIVE" | "HISTORY"; horizonS: number; errorS: number };

const HORIZONS = [
  { label: "0-5 min", min: 0, max: 300 },
  { label: "5-15 min", min: 300, max: 900 },
  { label: "15+ min", min: 900, max: Infinity },
];

function summarize(errors: number[]) {
  if (!errors.length) return { predictions: 0, meanAbsErrorS: null, medianAbsErrorS: null, p90AbsErrorS: null, within2MinPct: null, meanBiasS: null };
  const abs = errors.map(Math.abs).sort((a, b) => a - b);
  const pct = (q: number) => abs[Math.min(abs.length - 1, Math.floor(q * abs.length))];
  const r = (n: number) => Math.round(n);
  return {
    predictions: errors.length,
    meanAbsErrorS: r(abs.reduce((s, x) => s + x, 0) / abs.length),
    medianAbsErrorS: r(pct(0.5)),
    p90AbsErrorS: r(pct(0.9)),
    within2MinPct: Math.round((abs.filter((x) => x <= 120).length / abs.length) * 1000) / 10,
    meanBiasS: r(errors.reduce((s, x) => s + x, 0) / errors.length), // + = predicted too late, - = too early
  };
}

const byHorizon = (rows: Row[]) =>
  HORIZONS.map((h) => ({ horizon: h.label, ...summarize(rows.filter((r) => r.horizonS > h.min - (h.min === 0 ? 1 : 0) && r.horizonS <= h.max).map((r) => r.errorS)) }));

const improvement = (live: number | null, hist: number | null) =>
  live && hist !== null ? Math.round((1 - hist / live) * 1000) / 10 : null;

export async function etaAccuracy(routeId?: string) {
  // errorS = predicted - actual (positive = too late)
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT p."tripId", p."stoppageId", p."minuteBucket", p.method::text AS method, p."horizonS" AS "horizonS",
           EXTRACT(EPOCH FROM p."predictedArrivalAt" - a."arrivedAt")::float AS "errorS"
    FROM eta_prediction p
    JOIN stop_arrival a ON a."tripId" = p."tripId" AND a."stoppageId" = p."stoppageId"
    WHERE a."arrivedAt" > p."madeAt" AND (${routeId ?? null}::text IS NULL OR a."routeId" = ${routeId ?? null})`;

  const live = rows.filter((r) => r.method === "LIVE");
  const hist = rows.filter((r) => r.method === "HISTORY");

  const key = (r: Row) => `${r.tripId}|${r.stoppageId}|${r.minuteBucket}`;
  const liveByKey = new Map(live.map((r) => [key(r), r]));
  const pairs = hist.flatMap((h) => {
    const l = liveByKey.get(key(h));
    return l ? [{ live: l, hist: h }] : [];
  });
  const pairLive = summarize(pairs.map((p) => p.live.errorS));
  const pairHist = summarize(pairs.map((p) => p.hist.errorS));

  return {
    routeId: routeId ?? null,
    live: { overall: summarize(live.map((r) => r.errorS)), byHorizon: byHorizon(live) },
    history: { overall: summarize(hist.map((r) => r.errorS)), byHorizon: byHorizon(hist) },
    headToHead: {
      description: "Same moments, both methods: only where past data was available",
      live: pairLive,
      history: pairHist,
      byHorizon: HORIZONS.map((h) => {
        const inH = pairs.filter((p) => p.live.horizonS > h.min - (h.min === 0 ? 1 : 0) && p.live.horizonS <= h.max);
        const l = summarize(inH.map((p) => p.live.errorS));
        const hs = summarize(inH.map((p) => p.hist.errorS));
        return { horizon: h.label, pairs: inH.length, liveMeanAbsErrorS: l.meanAbsErrorS, historyMeanAbsErrorS: hs.meanAbsErrorS, improvementPct: improvement(l.meanAbsErrorS, hs.meanAbsErrorS) };
      }),
    },
    historyVsLiveImprovementPct: improvement(pairLive.meanAbsErrorS, pairHist.meanAbsErrorS),
  };
}
