import { requireAuthority } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handler, json, notFound } from "@/lib/http";
import type { IdCtx } from "@/lib/route-types";
import { listDriverTrips } from "@/lib/services/trips";

export const GET = handler(async (req: Request, { params }: IdCtx) => {
  await requireAuthority(req);
  const { id } = await params;
  if (!(await prisma.driver.findUnique({ where: { id } }))) throw notFound("Driver not found");
  return json({ driverId: id, trips: await listDriverTrips(id) }, 200, req);
});
