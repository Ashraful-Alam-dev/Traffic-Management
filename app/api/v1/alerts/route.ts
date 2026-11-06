import { requireAuthority } from "@/lib/auth";
import { handler, json } from "@/lib/http";
import { alertsQuery, query } from "@/lib/validation";
import { listAlerts } from "@/lib/services/alerts";
import { abandonStaleTrips } from "@/lib/services/trips";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  await requireAuthority(req);
  const q = alertsQuery.parse(query(req));
  await abandonStaleTrips();
  return json({ alerts: await listAlerts(q) }, 200, req);
});
