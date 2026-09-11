import { LocationClient, SearchPlaceIndexForTextCommand } from "@aws-sdk/client-location";
import { roundForStorage, isUsablePoint, type Point } from "@noghost/logic";
import { awsConfig } from "./aws";

/**
 * Turning "30308" or "Lisbon" into a coordinate — the fallback for anybody who
 * declines the browser's location prompt, or is on a desktop where it is
 * useless anyway.
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

let client: LocationClient | null = null;

const PLACE_INDEX = process.env.AWS_PLACE_INDEX ?? "";

export function geocodingConfigured(): boolean {
  return Boolean(awsConfig() && PLACE_INDEX);
}

export async function geocode(query: string): Promise<GeocodeOutcome> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { ok: false, reason: "Type a postcode or a town." };

  const config = awsConfig();
  if (!config || !PLACE_INDEX) {
    return {
      ok: false,
      reason: "Looking up a place isn't set up here — use the button above instead.",
    };
  }

  client ??= new LocationClient(config);

  try {
    const out = await client.send(
      new SearchPlaceIndexForTextCommand({
        IndexName: PLACE_INDEX,
        Text: trimmed,
        // One result. This is not a place picker — the question is "roughly
        // where are you", and offering five near-identical rows invites
        // somebody to think the choice matters.
        MaxResults: 1,
      }),
    );

    const found = out.Results?.[0];
    const position = found?.Place?.Geometry?.Point;
    // Amazon returns [longitude, latitude]. The order is the single easiest
    // thing to get wrong here, and getting it wrong puts Atlanta in Antarctica.
    const point = position ? { lat: position[1]!, lng: position[0]! } : null;

    if (!isUsablePoint(point)) {
      return { ok: false, reason: "We couldn't find that. Try a postcode, or the nearest town." };
    }

    const place = found!.Place!;
    const label =
      [place.Municipality, place.Region ?? place.SubRegion, place.Country]
        .filter(Boolean)
        .join(", ") || place.Label || trimmed;

    return { ok: true, result: { point: roundForStorage(point), label } };
  } catch (cause) {
    console.error(`[geocode] ${trimmed}: ${cause instanceof Error ? cause.message : cause}`);
    return { ok: false, reason: "That lookup didn't work. Try again, or use the button above." };
  }
}
