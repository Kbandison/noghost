import { GeoPlacesClient, GeocodeCommand } from "@aws-sdk/client-geo-places";
import { placeLabel, roundForStorage, isUsablePoint, type Point } from "@noghost/logic";
import { awsConfig } from "./aws";

/**
 * Turning "30308" or "Lisbon" into a coordinate — the fallback for anybody who
 * declines the browser's location prompt, or is on a desktop where it is
 * useless anyway.
 *
 * ---------------------------------------------------------------------------
 * Places v2, not v1
 * ---------------------------------------------------------------------------
 *
 * This first shipped against `SearchPlaceIndexForText` from
 * `@aws-sdk/client-location`. That is the v1 Places API: AWS's own reference
 * files it under `/location/previous/`, says it "is no longer current and may
 * be deprecated in the future", and recommends `Geocode` instead. It also
 * required standing up a *place index* resource before a single lookup could
 * run, which is a thing to create, name, pay attention to and put in an env
 * var. v2 has no resource at all — credentials, a region, and a call.
 *
 * ---------------------------------------------------------------------------
 * `IntendedUse: "Storage"` is not optional for us
 * ---------------------------------------------------------------------------
 *
 * It defaults to `SingleUse`, which means "show this on a map and throw it
 * away". NoGhost writes the coordinate to `profiles.lat/lng` and keeps it for
 * the life of the account, which is exactly what `Storage` is for — AWS's
 * reference is explicit that storing a response without it breaks the terms of
 * service. It is billed at roughly eight times the single-use rate ($4.00 per
 * 1,000 requests against $0.50 at time of writing), and that is the correct
 * trade: the alternative is geocoding the same person on every screen that
 * needs to know where they are.
 *
 * Rounded here as well as in the browser. The geolocation path rounds on the
 * device so the precise value never leaves it; this path has no device value to
 * protect, but a geocoder happily returns six decimals of a building, and the
 * product has no business storing that either.
 */

export interface GeocodeResult {
  point: Point;
  /** What to show back — "Atlanta, GA". Never coordinates. */
  label: string;
}

export type GeocodeOutcome =
  | { ok: true; result: GeocodeResult }
  | { ok: false; reason: string };

let client: GeoPlacesClient | null = null;

/**
 * Credentials and a region are the whole requirement now.
 *
 * There was an `AWS_PLACE_INDEX` here, and it is gone with v1 — a deployment
 * that still sets it is harmless, and one that forgot to is no longer broken.
 */
export function geocodingConfigured(): boolean {
  return awsConfig() !== null;
}

export async function geocode(query: string): Promise<GeocodeOutcome> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { ok: false, reason: "Type a postcode or a town." };

  const config = awsConfig();
  if (!config) {
    return {
      ok: false,
      reason: "Looking a place up isn't switched on here — use the button above instead.",
    };
  }

  client ??= new GeoPlacesClient(config);

  try {
    const out = await client.send(
      new GeocodeCommand({
        QueryText: trimmed,
        // See the note above. We persist the answer, so this is a terms-of-
        // service requirement rather than a tuning knob.
        IntendedUse: "Storage",
        // One result. This is not a place picker — the question is "roughly
        // where are you", and offering five near-identical rows invites
        // somebody to think the choice matters.
        MaxResults: 1,
      }),
    );

    const found = out.ResultItems?.[0];
    const position = found?.Position;
    // WGS 84, and Amazon returns [longitude, latitude]. The order is the single
    // easiest thing to get wrong here, and getting it wrong puts Atlanta in
    // Antarctica — which is why `profiles_lat_range` exists to catch it.
    const point = position ? { lat: position[1]!, lng: position[0]! } : null;

    if (!isUsablePoint(point)) {
      return { ok: false, reason: "We couldn't find that. Try a postcode, or the nearest town." };
    }

    // A place, never an address — see `placeLabel`, which exists because the
    // obvious choice here (Amazon's ready-made `Title`) names a building.
    const address = found!.Address;
    const label = placeLabel(
      {
        title: found!.Title,
        locality: address?.Locality,
        regionCode: address?.Region?.Code,
        regionName: address?.Region?.Name,
        subRegion: address?.SubRegion?.Name,
        country: address?.Country?.Name,
      },
      trimmed,
    );

    return { ok: true, result: { point: roundForStorage(point), label } };
  } catch (cause) {
    console.error(`[geocode] ${trimmed}: ${cause instanceof Error ? cause.message : cause}`);
    return { ok: false, reason: "That lookup didn't work. Try again, or use the button above." };
  }
}
