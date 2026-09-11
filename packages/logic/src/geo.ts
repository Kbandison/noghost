/**
 * Where somebody is, and how far they will go — the geography half of the drop
 * scorer (§6.1), replacing a hardcoded list of Atlanta neighborhoods.
 *
 * The old model scored +3 when two people shared one of three Atlanta
 * "clusters". That works for one city and only one: the clusters are code, the
 * neighborhood list is code, and launching a second city meant shipping a
 * release. It also gave the scorer a coarse signal — two people in the same
 * cluster might be nine miles apart, two people either side of a cluster line
 * might be half a mile apart and score nothing.
 *
 * Coordinates fix both. A point and a radius mean nothing per-city is curated,
 * the same code serves Atlanta and Lisbon, and "near each other" becomes a real
 * number rather than a shared label.
 *
 * Deliberately coarse in one respect: a member's stored point is the centre of
 * their postcode, not their address. The product never needs to know where
 * somebody lives, and storing a precise home location for people who are about
 * to meet strangers is a liability with no upside — see `roundForStorage`.
 */

export interface Point {
  lat: number;
  lng: number;
}

/** Metres. The drop is a city-scale question, so kilometres are the unit. */
const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle distance in metres.
 *
 * Haversine rather than a flat-earth approximation: the approximation is fine
 * within a city and wrong near the poles and across the date line, and a dating
 * product that silently mis-sorts everybody in Reykjavík for want of eight
 * lines of trigonometry is not a trade worth making.
 */
export function distanceMetres(a: Point, b: Point): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const distanceKm = (a: Point, b: Point): number => distanceMetres(a, b) / 1000;

/**
 * How far somebody will travel, in kilometres.
 *
 * A short list rather than a free number. "Anywhere within 23km" is not a thing
 * anyone means, and a slider with 200 positions is 200 chances to fidget over a
 * question that has about four real answers.
 */
export const TRAVEL_RADII_KM = [5, 10, 25, 50, 100] as const;
export type TravelRadiusKm = (typeof TRAVEL_RADII_KM)[number];
export const DEFAULT_TRAVEL_RADIUS_KM: TravelRadiusKm = 25;

/**
 * Both have to be willing, which is the same rule the age range already
 * follows: a drop happens when each person's preference admits the other.
 *
 * Using the smaller of the two radii rather than either one alone means a
 * person who will cross a city is not repeatedly shown to somebody who will
 * not, and neither is quietly overruled.
 */
export function withinReach(
  a: Point,
  aRadiusKm: number,
  b: Point,
  bRadiusKm: number,
): boolean {
  return distanceKm(a, b) <= Math.min(aRadiusKm, bRadiusKm);
}

/**
 * Proximity as score, replacing the flat +3 for a shared cluster.
 *
 * Graded rather than binary, because the old rule's failure was its edges:
 * half a mile apart across a cluster boundary scored zero, nine miles apart
 * inside one scored full marks. The curve is deliberately shallow — distance
 * should nudge the ordering, not dominate it. Shared interests can still
 * outscore it, which is the right priority for a product whose pitch is about
 * having something to say rather than being nearby.
 */
export const MAX_PROXIMITY_SCORE = 3;

export function proximityScore(a: Point | null, b: Point | null): number {
  if (!a || !b) return 0;
  const km = distanceKm(a, b);
  if (km <= 5) return 3;
  if (km <= 15) return 2;
  if (km <= 40) return 1;
  return 0;
}

/**
 * What a member is told, which is never a precise number.
 *
 * "3.7km away" is a circle somebody can stand on the edge of; two or three of
 * them intersect at an address. Buckets are the same information at the
 * resolution the decision actually needs — nobody chooses differently between
 * 3.7km and 4.1km.
 */
export function distanceLabel(a: Point | null, b: Point | null): string | null {
  if (!a || !b) return null;
  const km = distanceKm(a, b);
  if (km < 2) return "Just around the corner";
  if (km < 5) return "A few minutes away";
  if (km < 15) return "Across town";
  if (km < 40) return "A bit of a drive";
  return "Worth the trip";
}

/**
 * Three decimal places — about 110 metres at the equator, less elsewhere.
 *
 * Enough for every distance decision this product makes and not enough to
 * locate a home. Applied before the coordinate is ever stored, so the precise
 * value exists only in the browser that produced it: a database that never held
 * it cannot leak it, and a subpoena cannot ask for it.
 */
export function roundForStorage(point: Point): Point {
  return {
    lat: Math.round(point.lat * 1000) / 1000,
    lng: Math.round(point.lng * 1000) / 1000,
  };
}

/** Rejects the nulls, the swapped pairs, and the (0,0) that means "unset". */
export function isUsablePoint(point: Partial<Point> | null | undefined): point is Point {
  if (!point || typeof point.lat !== "number" || typeof point.lng !== "number") return false;
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return false;
  if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) return false;
  // Null Island is in the Gulf of Guinea and nobody lives there; it is what a
  // failed geocode looks like.
  return !(point.lat === 0 && point.lng === 0);
}

/**
 * What a member is shown after a lookup — a place, never an address.
 *
 * Written from a live response, because the assumption it replaces was wrong.
 * The first version handed back Amazon's ready-made `Title` on the theory that
 * a postcode query returns the postcode. Asking the real API for `30308` gave:
 *
 *   "30308, U-Rescue Villa, Atlanta, GA, United States"
 *
 * A named building. Shown back to an applicant that reads as though we have
 * pinned them to a doorway — in a product whose entire geography story is
 * "enough to sort a city, never enough to find a door", and which rounds the
 * coordinate to 110 metres two or three times over to keep that true. Getting
 * the number right and then printing the building next to it would undo all of
 * it in one line of UI text.
 *
 * So the locality is composed here and `Title` is the last resort rather than
 * the first. The question this answers, for the person reading it, is only
 * "did the lookup understand me" — and "Atlanta, GA" answers that completely.
 */
export interface PlaceName {
  title?: string | null;
  locality?: string | null;
  regionCode?: string | null;
  regionName?: string | null;
  subRegion?: string | null;
  country?: string | null;
}

export function placeLabel(place: PlaceName, typed: string): string {
  const clean = (value: string | null | undefined): string | null => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };

  const locality = clean(place.locality) ?? clean(place.subRegion);
  // "Atlanta, GA" reads better than "Atlanta, Georgia", and a code is only a
  // code when it is short — some regions report their full name in both.
  const code = clean(place.regionCode);
  const region = code && code.length <= 3 ? code : clean(place.regionName);
  const country = clean(place.country);

  const parts = locality
    ? [locality, region ?? country]
    : region
      ? [region, country]
      : [country];

  const label = parts.filter(Boolean).join(", ");
  if (label) return label;

  /*
   * Only now the title, and only its tail. Amazon leads with the most specific
   * component, so dropping everything before the last two segments turns
   * "30308, U-Rescue Villa, Atlanta, GA, United States" into "GA, United
   * States" rather than naming a building.
   */
  const title = clean(place.title);
  if (title) {
    const segments = title.split(",").map((segment) => segment.trim()).filter(Boolean);
    return segments.slice(-2).join(", ") || title;
  }

  return typed;
}
