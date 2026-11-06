import { handler, json } from "@/lib/http";
import { limitPublic } from "@/lib/services/ratelimit";
import { listRoutes } from "@/lib/services/buses";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  await limitPublic(req);
  return json({ routes: await listRoutes() }, 200, req);
});
