import { handler, json } from "@/lib/http";
import type { IdCtx } from "@/lib/route-types";
import { limitPublic } from "@/lib/services/ratelimit";
import { routeStoppages } from "@/lib/services/buses";

export const GET = handler(async (req: Request, { params }: IdCtx) => {
  await limitPublic(req);
  const { id } = await params;
  return json({ routeId: id, stoppages: await routeStoppages(id) }, 200, req);
});
