# Load test results

How to run: start the app (`npm run build && npm start`), then `npm run loadtest -- --buses 300 --passengers 300 --seconds 60`.
The script creates temporary buses and drivers, runs the load, prints a table, and deletes the temporary data.

- Each bus sends a GPS point every 5 s (`POST /trips/{id}/location`, one DB transaction with detection).
- Each passenger asks for an ETA every 5 s (`GET /buses/{id}/eta`, rate limited per IP).
- Machine: Intel Core i7-1360P laptop (16 threads, 16 GB RAM), Windows. One `next start` process + local PostgreSQL 18.

## 300 buses + 300 passengers, 60 s (about 110 requests/s)

| Request | Count | Req/s | p50 ms | p95 ms | p99 ms | Max ms | Errors |
|---|---|---|---|---|---|---|---|
| POST location | 3598 | 55.4 | 45 | 175 | 388 | 507 | 0 |
| GET eta | 3597 | 55.4 | 54 | 193 | 492 | 663 | 0 |

## 500 buses + 500 passengers (about 200 requests/s offered): saturated

The single Node process reached its limit (about 1.7 CPU cores busy: JavaScript thread + Prisma query engine).
Throughput stayed near 100-120 requests/s and latency grew to seconds. Before the fixes below, location
posts also failed with Prisma `P2028` (no free DB connection within 2 s).

## What was changed after the first test

1. The location transaction was cut from ~8 to ~5 queries: one statement reads and locks the trip,
   and the unique index detects duplicate points (no separate lookup).
2. The "abandon stale trips" check, which runs before most reads, now asks the DB only for stale trips
   instead of loading every active trip.
3. Route stops (read-only seed data) are cached per process for 5 minutes.
4. Transactions wait up to 5 s for a pooled connection during short bursts instead of failing after 2 s.

## Next steps for more load

Run more instances (on Vercel this happens automatically), keep a pooled DB connection (Neon pooler /
PgBouncer), and move detection to a queue if one instance's CPU stays the limit.
