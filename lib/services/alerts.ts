import type { AlertType } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { notFound } from "@/lib/http";

const ACTIVE = ["OPEN", "ACKNOWLEDGED"] as const;

export async function openAlert(tx: Tx, a: { busId: string; tripId: string; type: AlertType; lat: number; lng: number }) {
  const existing = await tx.alert.findFirst({ where: { busId: a.busId, type: a.type, status: { in: [...ACTIVE] } } });
  if (existing) return null;
  return tx.alert.create({ data: a });
}

export async function resolveAlerts(tx: Tx, busId: string, types?: AlertType[]) {
  await tx.alert.updateMany({
    where: { busId, status: { in: [...ACTIVE] }, ...(types ? { type: { in: types } } : {}) },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
}

export async function listAlerts(f: { status?: "OPEN" | "ACKNOWLEDGED" | "RESOLVED"; type?: AlertType }) {
  return prisma.alert.findMany({
    where: { status: f.status, type: f.type },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function updateAlertStatus(id: string, status: "ACKNOWLEDGED" | "RESOLVED") {
  const alert = await prisma.alert.findUnique({ where: { id } });
  if (!alert) throw notFound("Alert not found");
  return prisma.alert.update({
    where: { id },
    data: { status, resolvedAt: status === "RESOLVED" ? new Date() : null },
  });
}
