-- CreateEnum
CREATE TYPE "EtaMethod" AS ENUM ('LIVE', 'HISTORY');

-- CreateTable
CREATE TABLE "stop_arrival" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "stoppageId" TEXT NOT NULL,
    "stopIndex" INTEGER NOT NULL,
    "arrivedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stop_arrival_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eta_prediction" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "stoppageId" TEXT NOT NULL,
    "method" "EtaMethod" NOT NULL,
    "madeAt" TIMESTAMP(3) NOT NULL,
    "minuteBucket" INTEGER NOT NULL,
    "horizonS" INTEGER NOT NULL,
    "predictedArrivalAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eta_prediction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stop_arrival_routeId_direction_idx" ON "stop_arrival"("routeId", "direction");

-- CreateIndex
CREATE UNIQUE INDEX "stop_arrival_tripId_stoppageId_key" ON "stop_arrival"("tripId", "stoppageId");

-- CreateIndex
CREATE UNIQUE INDEX "eta_prediction_tripId_stoppageId_method_minuteBucket_key" ON "eta_prediction"("tripId", "stoppageId", "method", "minuteBucket");

-- AddForeignKey
ALTER TABLE "stop_arrival" ADD CONSTRAINT "stop_arrival_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eta_prediction" ADD CONSTRAINT "eta_prediction_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
