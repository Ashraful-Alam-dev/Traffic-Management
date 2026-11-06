import { requireAuthority } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handler, json, notFound } from "@/lib/http";
import type { IdCtx } from "@/lib/route-types";
import { getDriverRating } from "@/lib/services/score";

export const GET = handler(async (req: Request, { params }: IdCtx) => {
  await requireAuthority(req);
  const { id } = await params;
  if (!(await prisma.driver.findUnique({ where: { id } }))) throw notFound("Driver not found");
  return json(await getDriverRating(id), 200, req);
});
