import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export const hasDb = !!process.env.DATABASE_URL;
export const BASE = "http://test.local/api/v1";

export async function call(
  handler: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>,
  opts: { method?: string; path?: string; body?: unknown; token?: string; id?: string } = {},
) {
  const req = new Request(BASE + (opts.path ?? "/"), {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const res = await handler(req, { params: Promise.resolve({ id: opts.id ?? "" }) });
  return { status: res.status, body: await res.json() };
}

export async function resetAndSeed() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE driving_event, alert, location, bus_latest_location, trip, driver, app_user, bus, route_stoppage, route, stoppage, bus_company, rate_limit CASCADE`,
  );
  const hash = await bcrypt.hash("pw", 4);
  await prisma.busCompany.create({ data: { id: "co", name: "Co", ownerName: "O" } });
  await prisma.route.create({ data: { id: "r1", name: "R1", companyId: "co" } });
  const stops = [
    { id: "s1", name: "Shyamoli", lat: 23.7745, lng: 90.3657 },
    { id: "s2", name: "Farmgate", lat: 23.7577, lng: 90.3897 },
    { id: "s3", name: "Shahbag", lat: 23.7389, lng: 90.3958 },
  ];
  for (const [i, s] of stops.entries()) {
    await prisma.stoppage.create({ data: s });
    await prisma.routeStoppage.create({ data: { routeId: "r1", stoppageId: s.id, stopOrder: i + 1 } });
  }
  for (const n of [1, 2]) {
    await prisma.bus.create({ data: { id: `b${n}`, plateNumber: `P${n}`, routeId: "r1" } });
    await prisma.appUser.create({ data: { id: `u${n}`, email: `d${n}@test.bus`, passwordHash: hash, role: "driver" } });
    await prisma.driver.create({ data: { id: `d${n}`, userId: `u${n}`, name: `Driver Full Name ${n}`, displayName: `D${n}`, busId: `b${n}` } });
  }
  await prisma.appUser.create({ data: { id: "ua", email: "a@test.bus", passwordHash: hash, role: "authority" } });
}
