export type LatLng = { lat: number; lng: number };

const R = 6_371_000; // Earth radius in meters
const rad = (d: number) => (d * Math.PI) / 180;

// Great-circle distance in meters.
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function isNearAny(p: LatLng, stops: LatLng[], radiusM: number): boolean {
  return stops.some((s) => haversineM(p, s) <= radiusM);
}

export const kmhToMps = (kmh: number) => kmh / 3.6;
