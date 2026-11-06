import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  if (req.method !== "OPTIONS") return NextResponse.next();
  const origin = req.headers.get("origin");
  const allowed = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Authorization, Content-Type, x-cron-secret",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  });
}

export const config = { matcher: "/api/:path*" };
