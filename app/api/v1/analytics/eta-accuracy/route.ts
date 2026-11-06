import { z } from "zod";
import { requireAuthority } from "@/lib/auth";
import { handler, json } from "@/lib/http";
import { query } from "@/lib/validation";
import { etaAccuracy } from "@/lib/services/analytics";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  await requireAuthority(req);
  const { routeId } = z.object({ routeId: z.string().optional() }).parse(query(req));
  return json(await etaAccuracy(routeId), 200, req);
});
