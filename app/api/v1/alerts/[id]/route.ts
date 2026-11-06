import { requireAuthority } from "@/lib/auth";
import { handler, json, readJson } from "@/lib/http";
import type { IdCtx } from "@/lib/route-types";
import { alertPatchSchema } from "@/lib/validation";
import { updateAlertStatus } from "@/lib/services/alerts";

export const PATCH = handler(async (req: Request, { params }: IdCtx) => {
  await requireAuthority(req);
  const { id } = await params;
  const { status } = alertPatchSchema.parse(await readJson(req));
  return json(await updateAlertStatus(id, status), 200, req);
});
