-- At most one ACTIVE trip per driver and per bus (blocks concurrent starts).
CREATE UNIQUE INDEX "trip_one_active_per_driver" ON "trip"("driverId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "trip_one_active_per_bus" ON "trip"("busId") WHERE "status" = 'ACTIVE';
