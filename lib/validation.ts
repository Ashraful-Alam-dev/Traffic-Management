import { z } from "zod";
import { T } from "./config/thresholds";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

export const startTripSchema = z.object({
  direction: z.enum(["UP", "DOWN"]),
});

export const locationSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    speedKmh: z.number().min(0).max(150),
    recordedAt: z.string().datetime({ offset: true }).transform((s) => new Date(s)),
  })
  .refine((v) => v.recordedAt.getTime() <= Date.now() + T.MAX_FUTURE_MS, {
    message: "recordedAt is more than 60 s in the future",
    path: ["recordedAt"],
  })
  .refine((v) => v.recordedAt.getTime() >= Date.now() - T.MAX_PAST_MS, {
    message: "recordedAt is more than 10 minutes in the past",
    path: ["recordedAt"],
  });

export const alertPatchSchema = z.object({
  status: z.enum(["ACKNOWLEDGED", "RESOLVED"]),
});

export const busesQuery = z.object({
  routeId: z.string().optional(),
  companyId: z.string().optional(),
  status: z.enum(["ACTIVE", "IDLE"]).optional(),
});

export const alertsQuery = z.object({
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]).optional(),
  type: z.enum(["UNSCHEDULED_STOP", "JAM", "SEVERE_OVERSPEED"]).optional(),
});

export const etaQuery = z.object({ stoppageId: z.string().min(1) });

export function query(req: Request): Record<string, string> {
  return Object.fromEntries(new URL(req.url).searchParams.entries());
}
