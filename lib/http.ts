import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string) => new ApiError(400, "BAD_REQUEST", msg);
export const unauthorized = (msg = "Missing or invalid token") => new ApiError(401, "UNAUTHORIZED", msg);
export const forbidden = (msg = "Not allowed") => new ApiError(403, "FORBIDDEN", msg);
export const notFound = (msg = "Not found") => new ApiError(404, "NOT_FOUND", msg);
export const conflict = (msg: string) => new ApiError(409, "CONFLICT", msg);
export const tooMany = (msg = "Too many requests") => new ApiError(429, "RATE_LIMITED", msg);

function corsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("origin");
  const allowed = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      Vary: "Origin",
    };
  }
  return {};
}

export function json(data: unknown, status = 200, req?: Request): Response {
  return Response.json(data, { status, headers: corsHeaders(req) });
}

export function errorResponse(err: unknown, req?: Request): Response {
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message } }, err.status, req);
  }
  if (err instanceof ZodError) {
    const msg = err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return json({ error: { code: "VALIDATION_ERROR", message: msg } }, 400, req);
  }
  // don't log the message: it can contain secrets or locations
  const code = (err as { code?: unknown })?.code; // e.g. Prisma P2024; safe to log
  console.error("Unhandled error:", err instanceof Error ? err.name : typeof err, typeof code === "string" ? code : "");
  return json({ error: { code: "INTERNAL", message: "Internal server error" } }, 500, req);
}

export function handler<C>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err, req);
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw badRequest("Body must be valid JSON");
  }
}
