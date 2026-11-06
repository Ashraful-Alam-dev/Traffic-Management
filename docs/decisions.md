# Design decisions

Smaller decisions and the reasoning behind them.

1. **bcryptjs instead of native bcrypt.** Alternative: `bcrypt` (native). Why: same algorithm, no native build on Windows or Vercel.
2. **Abandonment and ETA confidence use server time of the last applied point** (`bus_latest_location.updatedAt`), not device time. Alternative: `recordedAt`. Why: the device clock decides detection, but "is this bus still sending?" is a server question. It also keeps the demo (backdated timestamps) from being abandoned.
3. **Points before the trip's start time are accepted** if inside the 10-minute window. Alternative: reject them. Why: phones can buffer points; keeps the demo simple.
4. **Ending a trip resolves all of the bus's active alerts.** Alternative: leave them open. Why: an alert about a bus that is no longer on a trip is noise.
5. **ACKNOWLEDGED alerts count as active** for dedupe (no new alert of the same type while one is acknowledged). Why: avoids a duplicate after an officer acknowledges.
6. **Passenger position is only shown during an active trip.** Alternative: always show last known. Why: privacy when the driver is off duty.
7. **Passenger driver info** comes from the active trip's driver, otherwise the bus's assigned driver.
8. **Stars on passenger endpoints use the cached driver rating**; rating endpoints compute it live from completed trips (same formula, same result).
9. **Abandoned trips get a score saved** (for the record) but are excluded from rating.
10. **Concurrent trip starts** are blocked by a partial unique index (one ACTIVE trip per driver and per bus), not only by the check in code.
11. **Rate-limit rows** are cleaned up (older than 1 hour) by the cron endpoint.
12. **IP for rate limiting** is the first `x-forwarded-for` entry (set by Vercel), else `x-real-ip`.
13. **Severity:** harsh brake HIGH if >= 5 m/s^2 else MEDIUM; overspeed HIGH if severe; stops MEDIUM.
14. **JWT lifetime 12 hours** (one driver shift).
15. **Local DB is the installed PostgreSQL** (port 5432), with a `bus` role and two databases: `bus` (dev) and `bus_test` (tests). No Docker.
