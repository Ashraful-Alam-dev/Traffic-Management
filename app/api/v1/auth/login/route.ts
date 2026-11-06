import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/auth";
import { ApiError, handler, json, readJson } from "@/lib/http";
import { loginSchema } from "@/lib/validation";

export const POST = handler(async (req: Request) => {
  const body = loginSchema.parse(await readJson(req));
  const user = await prisma.appUser.findUnique({ where: { email: body.email }, include: { driver: true } });
  const ok = user ? await bcrypt.compare(body.password, user.passwordHash) : false;
  if (!user || !ok) throw new ApiError(401, "INVALID_CREDENTIALS", "Wrong email or password");

  const token = await signToken({ userId: user.id, role: user.role, driverId: user.driver?.id });
  return json({ token, role: user.role, expiresIn: "12h" }, 200, req);
});
