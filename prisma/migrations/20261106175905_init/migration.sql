-- CreateEnum
CREATE TYPE "Role" AS ENUM ('driver', 'authority');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('UP', 'DOWN');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('HARSH_BRAKE', 'OVERSPEED', 'UNSCHEDULED_STOP');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('UNSCHEDULED_STOP', 'JAM', 'SEVERE_OVERSPEED');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "bus_company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,

    CONSTRAINT "bus_company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stoppage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "stoppage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_stoppage" (
    "routeId" TEXT NOT NULL,
    "stoppageId" TEXT NOT NULL,
    "stopOrder" INTEGER NOT NULL,

    CONSTRAINT "route_stoppage_pkey" PRIMARY KEY ("routeId","stoppageId")
);

-- CreateTable
CREATE TABLE "bus" (
    "id" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,

    CONSTRAINT "bus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "rating" DOUBLE PRECISION,
    "ratedTripsCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" "TripStatus" NOT NULL DEFAULT 'ACTIVE',
    "distanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "score" INTEGER,

    CONSTRAINT "trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "speedKmh" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bus_latest_location" (
    "busId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "speedKmh" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "stoppedSince" TIMESTAMP(3),
    "slowSince" TIMESTAMP(3),
    "overspeedSince" TIMESTAMP(3),
    "overspeedMaxKmh" DOUBLE PRECISION,
    "lastHarshBrakeAt" TIMESTAMP(3),
    "nextStopOrder" INTEGER,

    CONSTRAINT "bus_latest_location_pkey" PRIMARY KEY ("busId")
);

-- CreateTable
CREATE TABLE "driving_event" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "severity" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "penalty" INTEGER NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driving_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert" (
    "id" TEXT NOT NULL,
    "tripId" TEXT,
    "busId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "route_stoppage_routeId_stopOrder_key" ON "route_stoppage"("routeId", "stopOrder");

-- CreateIndex
CREATE UNIQUE INDEX "bus_plateNumber_key" ON "bus"("plateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "driver_userId_key" ON "driver"("userId");

-- CreateIndex
CREATE INDEX "trip_driverId_status_endedAt_idx" ON "trip"("driverId", "status", "endedAt" DESC);

-- CreateIndex
CREATE INDEX "trip_busId_status_idx" ON "trip"("busId", "status");

-- CreateIndex
CREATE INDEX "location_busId_recordedAt_idx" ON "location"("busId", "recordedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "location_busId_recordedAt_key" ON "location"("busId", "recordedAt");

-- CreateIndex
CREATE INDEX "driving_event_tripId_idx" ON "driving_event"("tripId");

-- CreateIndex
CREATE INDEX "alert_busId_type_status_idx" ON "alert"("busId", "type", "status");

-- CreateIndex
CREATE INDEX "alert_status_createdAt_idx" ON "alert"("status", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "route" ADD CONSTRAINT "route_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "bus_company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stoppage" ADD CONSTRAINT "route_stoppage_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stoppage" ADD CONSTRAINT "route_stoppage_stoppageId_fkey" FOREIGN KEY ("stoppageId") REFERENCES "stoppage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus" ADD CONSTRAINT "bus_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver" ADD CONSTRAINT "driver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver" ADD CONSTRAINT "driver_busId_fkey" FOREIGN KEY ("busId") REFERENCES "bus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip" ADD CONSTRAINT "trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip" ADD CONSTRAINT "trip_busId_fkey" FOREIGN KEY ("busId") REFERENCES "bus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip" ADD CONSTRAINT "trip_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_latest_location" ADD CONSTRAINT "bus_latest_location_busId_fkey" FOREIGN KEY ("busId") REFERENCES "bus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driving_event" ADD CONSTRAINT "driving_event_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driving_event" ADD CONSTRAINT "driving_event_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert" ADD CONSTRAINT "alert_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
