import { requireDriver } from "@/lib/auth";
import { handler, json } from "@/lib/http";
import { listDriverTrips } from "@/lib/services/trips";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const s = await requireDriver(req);
  return json({ trips: await listDriverTrips(s.driverId) }, 200, req);
});
