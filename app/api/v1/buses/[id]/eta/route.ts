import { handler, json } from "@/lib/http";
import type { IdCtx } from "@/lib/route-types";
import { etaQuery, query } from "@/lib/validation";
import { limitPublic } from "@/lib/services/ratelimit";
import { getEta } from "@/lib/services/eta";

export const GET = handler(async (req: Request, { params }: IdCtx) => {
  await limitPublic(req);
  const { id } = await params;
  const { stoppageId } = etaQuery.parse(query(req));
  return json(await getEta(id, stoppageId), 200, req);
});
