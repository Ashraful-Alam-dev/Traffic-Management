-- One-time local setup: app role "bus" (demo password "bus") and two databases.
-- Run as the postgres superuser: psql -U postgres -h localhost -f scripts/setup-local-db.sql
CREATE ROLE bus LOGIN PASSWORD 'bus' CREATEDB; -- CREATEDB: prisma migrate dev needs a shadow DB
CREATE DATABASE bus OWNER bus;
CREATE DATABASE bus_test OWNER bus;
