import { SignJWT, jwtVerify } from "jose";
import { forbidden, unauthorized } from "./http";

export type Role = "driver" | "authority";
export type Session = { userId: string; role: Role; driverId?: string };

const TOKEN_TTL = "12h";

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_SECRET must be set (32+ chars)");
  return new TextEncoder().encode(s);
}

export async function signToken(s: Session): Promise<string> {
  return new SignJWT({ role: s.role, driverId: s.driverId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secret());
}

export async function getSession(req: Request): Promise<Session> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) throw unauthorized();
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    const role = payload.role;
    if ((role !== "driver" && role !== "authority") || !payload.sub) throw new Error("bad claims");
    return { userId: payload.sub, role, driverId: typeof payload.driverId === "string" ? payload.driverId : undefined };
  } catch {
    throw unauthorized();
  }
}

export async function requireDriver(req: Request): Promise<Session & { driverId: string }> {
  const s = await getSession(req);
  if (s.role !== "driver" || !s.driverId) throw forbidden("Driver role required");
  return s as Session & { driverId: string };
}

export async function requireAuthority(req: Request): Promise<Session> {
  const s = await getSession(req);
  if (s.role !== "authority") throw forbidden("Authority role required");
  return s;
}
