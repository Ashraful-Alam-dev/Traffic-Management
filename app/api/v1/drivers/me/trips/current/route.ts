import { requireDriver } from "@/lib/auth";
import { handler, json } from "@/lib/http";
import { currentTrip } from "@/lib/services/trips";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const s = await requireDriver(req);
  return json({ trip: await currentTrip(s.driverId) }, 200, req);
});
