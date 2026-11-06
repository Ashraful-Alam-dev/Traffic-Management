import { requireAuthority } from "@/lib/auth";
import { handler, json } from "@/lib/http";
import type { IdCtx } from "@/lib/route-types";
import { getTrip, tripView } from "@/lib/services/trips";

export const GET = handler(async (req: Request, { params }: IdCtx) => {
  await requireAuthority(req);
  const { id } = await params;
  return json(await tripView(await getTrip(id)), 200, req);
});
