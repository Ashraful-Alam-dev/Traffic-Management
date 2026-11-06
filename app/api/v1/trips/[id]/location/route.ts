import { requireDriver } from "@/lib/auth";
import { handler, json, readJson } from "@/lib/http";
import type { IdCtx } from "@/lib/route-types";
import { locationSchema } from "@/lib/validation";
import { postLocation } from "@/lib/services/location";

export const POST = handler(async (req: Request, { params }: IdCtx) => {
  const s = await requireDriver(req);
  const { id } = await params;
  const point = locationSchema.parse(await readJson(req));
  const result = await postLocation(s.driverId, id, point);
  return json(result, result.applied ? 201 : 200, req);
});
