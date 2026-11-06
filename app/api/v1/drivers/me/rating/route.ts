import { requireDriver } from "@/lib/auth";
import { handler, json } from "@/lib/http";
import { getDriverRating } from "@/lib/services/score";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const s = await requireDriver(req);
  return json(await getDriverRating(s.driverId), 200, req);
});
