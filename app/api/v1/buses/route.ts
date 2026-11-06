import { requireAuthority } from "@/lib/auth";
import { handler, json } from "@/lib/http";
import { busesQuery, query } from "@/lib/validation";
import { authorityBuses } from "@/lib/services/buses";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  await requireAuthority(req);
  const q = busesQuery.parse(query(req));
  return json({ buses: await authorityBuses(q) }, 200, req);
});
