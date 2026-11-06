export const T = {
  // Location input
  MAX_PAST_MS: 10 * 60_000, // accept points up to 10 min old (phones buffer offline)
  MAX_FUTURE_MS: 60_000, // allow up to 60 s of device clock drift into the future
  MIN_INTERVAL_MS: 2_000, // under 2 s since the previous point -> 429

  // Harsh braking
  HARSH_BRAKE_MPS2: 3, // deceleration in m/s^2
  HARSH_BRAKE_MIN_GAP_S: 1, // only compare points 1-10 s apart
  HARSH_BRAKE_MAX_GAP_S: 10,
  HARSH_BRAKE_COOLDOWN_S: 30, // max one per bus per 30 s
  HARSH_BRAKE_PENALTY: 5,

  // Overspeed
  SPEED_LIMIT_KMH: 60, // single city-wide limit for the MVP
  OVERSPEED_MIN_S: 10, // must last 10 s to count
  SEVERE_OVER_KMH: 20, // more than 20 km/h over -> severe
  OVERSPEED_PENALTY: 5,
  SEVERE_OVERSPEED_PENALTY: 10,

  // Unscheduled stop
  STOP_SPEED_KMH: 2, // below this = stopped
  STOP_MIN_S: 60,
  STOP_PENALTY: 10,
  STOPPAGE_RADIUS_M: 50, // within 50 m of a stoppage = allowed stop

  // Jam
  // A stop that lasts this long is treated as traffic, not the driver's fault:
  // the unscheduled-stop penalty is cancelled and a JAM alert opens instead.
  JAM_SPEED_KMH: 5,
  JAM_MIN_S: 180,

  // Distance (GPS noise filter)
  MIN_MOVE_M: 10, // ignore jitter while parked
  MAX_IMPLIED_KMH: 150, // ignore GPS jumps

  // Score and rating
  RATING_WINDOW: 30, // last 30 completed trips
  RATING_MIN_TRIPS: 5,

  // Trips
  ABANDON_AFTER_MS: 10 * 60_000, // no location for 10 min -> ABANDONED

  // ETA
  ETA_SPEED_SAMPLES: 5,
  ETA_MIN_SPEED_KMH: 8, // floor so a stopped bus still gets an ETA
  ETA_HIGH_CONF_MS: 30_000,
  ETA_MEDIUM_CONF_MS: 2 * 60_000,
  ETA_HISTORY_MIN_SAMPLES: 3, // a stretch needs 3 past trips at this hour before history is trusted
  DHAKA_UTC_OFFSET_H: 6, // hour-of-day for history is Dhaka local time

  // Public rate limit
  PUBLIC_RATE_PER_MIN: 60,
} as const;
