import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = g.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") g.prisma = prisma;

// Type of the client inside prisma.$transaction(async (tx) => ...)
export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
