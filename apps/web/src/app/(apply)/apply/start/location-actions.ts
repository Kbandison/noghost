"use server";

import { geocode, geocodingConfigured } from "@/lib/geocode";

export interface LookupState {
  error?: string;
  lat?: number;
  lng?: number;
  label?: string;
}

/**
 * Turning what somebody typed into a coordinate.
 *
 * A server action rather than a public API route because it spends money on
 * every call — an open endpoint that geocodes arbitrary text is somebody else's
 * free geocoder, billed to us. This one is rate-limited by being a Server
 * Action on a page you have to be part-way through a funnel to reach.
 */
export async function lookupPlace(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const query = String(formData.get("place") ?? "");

  if (!geocodingConfigured()) {
    return {
      error: "Looking a place up isn't switched on here — use the button above instead.",
    };
  }

  const outcome = await geocode(query);
  if (!outcome.ok) return { error: outcome.reason };

  return {
    lat: outcome.result.point.lat,
    lng: outcome.result.point.lng,
    label: outcome.result.label,
  };
}
