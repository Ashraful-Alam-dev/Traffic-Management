import { requireDriver } from "@/lib/auth";
import { handler, json, readJson } from "@/lib/http";
import { startTripSchema } from "@/lib/validation";
import { startTrip, tripView } from "@/lib/services/trips";

export const POST = handler(async (req: Request) => {
  const s = await requireDriver(req);
  const { direction } = startTripSchema.parse(await readJson(req));
  const trip = await startTrip(s.driverId, direction);
  return json(await tripView(trip), 201, req);
});
