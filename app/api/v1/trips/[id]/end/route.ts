import { requireDriver } from "@/lib/auth";
import { handler, json } from "@/lib/http";
import type { IdCtx } from "@/lib/route-types";
import { endTrip, tripView } from "@/lib/services/trips";

export const PATCH = handler(async (req: Request, { params }: IdCtx) => {
  const s = await requireDriver(req);
  const { id } = await params;
  return json(await tripView(await endTrip(s.driverId, id)), 200, req);
});
