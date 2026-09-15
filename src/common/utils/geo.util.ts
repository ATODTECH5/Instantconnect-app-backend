/** GeoJSON order: longitude first. Matches what PostGIS returns for a point. */
export type GeoPoint = { type: 'Point'; coordinates: [number, number] };

const EARTH_RADIUS_M = 6_371_000;

/**
 * Great-circle distance in metres. Accurate to well under a metre at the
 * distances a safe zone cares about, and avoids a round trip to PostGIS for
 * two points already in memory.
 */
export function haversineMetres(a: GeoPoint, b: GeoPoint): number {
	const [lon1, lat1] = a.coordinates;
	const [lon2, lat2] = b.coordinates;
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

	return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
