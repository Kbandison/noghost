"use client";

import { startTransition, useActionState, useState, useSyncExternalStore } from "react";
import {
  defaultRadiusFor,
  formatRadius,
  radiiFor,
  roundForStorage,
  nearestRadius,
  unitForCountry,
  unitForLocale,
  type DistanceUnit,
} from "@noghost/logic";
import {
  lookupPlace,
  nameThisPlace,
  type LookupState,
} from "@/app/(apply)/apply/start/location-actions";
import { Chip } from "./field";

const initial: LookupState = {};

/* A value that never changes after load, so the subscribe function is a no-op. */
const NEVER_CHANGES = () => () => {};
const readLocaleUnit = (): DistanceUnit => unitForLocale(navigator.language);
const assumeMetric = (): DistanceUnit => "km";

/**
 * Roughly where you are, and how far you'll go.
 *
 * Two ways in, because neither alone is enough. The browser's own location is
 * one tap and works anywhere in the world, but a good number of people decline
 * it and on a desktop it is often wrong by miles. Typing a postcode always
 * works and is more effort. Offering both means nobody hits a wall.
 *
 * **The coordinate is rounded before it leaves this component.** Three decimals
 * is about 110 metres — enough to sort a city, not enough to find a house. The
 * precise value the browser hands over is never sent anywhere, which is a
 * stronger guarantee than promising to round it on arrival.
 *
 * What comes back is a place name, never numbers. "Atlanta, GA" tells somebody
 * the lookup worked; a pair of coordinates tells them the product is tracking
 * them, and invites them to wonder how precisely.
 */
export function LocationField({
  defaultLat,
  defaultLng,
  defaultLabel,
  defaultRadiusKm,
  error,
}: {
  defaultLat?: number;
  defaultLng?: number;
  defaultLabel?: string;
  defaultRadiusKm?: number;
  error?: string;
}) {
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(
    defaultLat !== undefined && defaultLng !== undefined
      ? { lat: defaultLat, lng: defaultLng }
      : null,
  );
  const [label, setLabel] = useState<string | null>(defaultLabel ?? null);
  /*
   * Miles or kilometres, decided before they have told us anything.
   *
   * Read through `useSyncExternalStore` rather than `useState(() => …)`, and
   * that is not stylistic. A state initialiser runs once, on the server, where
   * `navigator` does not exist — so it would settle on kilometres and React
   * would never re-run it during hydration. Every American would have seen
   * kilometres, and the bug would look like the locale check simply not
   * working.
   *
   * This hook exists for exactly this shape: a value the server cannot know,
   * with an explicit server fallback. Same pattern as `VoiceRecorder`'s
   * support check.
   */
  const localeUnit = useSyncExternalStore(NEVER_CHANGES, readLocaleUnit, assumeMetric);

  /** Set once a real place is known — a country beats a browser setting. */
  const [placeUnit, setPlaceUnit] = useState<DistanceUnit | null>(
    defaultRadiusKm === undefined ? null : null,
  );
  const unit: DistanceUnit = placeUnit ?? localeUnit;

  const [pickedRadius, setPickedRadius] = useState<number | null>(defaultRadiusKm ?? null);
  /*
   * Derived, not stored. An unpicked radius is "the sensible default for
   * whatever unit we are showing", so it follows the unit when a country
   * arrives instead of being stranded at a number from the other list.
   */
  const radius = pickedRadius ?? defaultRadiusFor(unit);

  /*
   * Always this unit's own list — never the other one's numbers with this
   * one's label. Showing the list a stored value came from meant an American
   * whose radius was set in kilometres saw "3 | 6 | 16 | 31 | 62 miles", which
   * is kilometres wearing a costume and reads as broken because it is.
   *
   * A value that is not on this list snaps to the nearest option at or above
   * it, and only persists if they save.
   */
  const options = radiiFor(unit);
  const selected = options.includes(radius) ? radius : nearestRadius(radius, options);

  /** A country beats the browser's locale — see `localeUnit` above. */
  function adoptUnit(country: string | null | undefined) {
    if (country) setPlaceUnit(unitForCountry(country));
  }
  const [asking, setAsking] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const [typed, setTyped] = useState("");

  /*
   * The result is applied inside the action rather than watched by an effect.
   * An effect that calls setState on the value it just observed is the
   * cascading-render pattern the lint rule is about, and here it would also
   * re-apply a stale lookup every time the component re-rendered for an
   * unrelated reason.
   */
  const [lookup, lookupAction, looking] = useActionState(
    async (prev: LookupState, formData: FormData) => {
      const result = await lookupPlace(prev, formData);
      if (result.lat !== undefined && result.lng !== undefined) {
        setPoint({ lat: result.lat, lng: result.lng });
        setLabel(result.label ?? null);
        adoptUnit(result.country);
        setDeviceError(null);
      }
      return result;
    },
    initial,
  );

  /*
   * Invoked directly rather than through a nested `<form>`. This component
   * renders inside the funnel's own form, and a form cannot contain another —
   * the `form="..."` attribute would need an element that has nowhere valid to
   * live. Submitting the outer form to look up a postcode would advance the
   * step instead.
   */
  function findPlace() {
    // The device error is about the button above, and it is stale the moment
    // somebody tries the other way in. Left standing, a failed lookup renders
    // behind it and they read "no location from this device" while typing
    // postcodes — the wrong reason, for the wrong control.
    setDeviceError(null);
    const data = new FormData();
    data.set("place", typed);
    startTransition(() => lookupAction(data));
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setDeviceError("This browser can't share a location. Type a postcode instead.");
      return;
    }
    setAsking(true);
    setDeviceError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Rounded here, on the device, before it is ever put in a form field.
        const rounded = roundForStorage({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setPoint(rounded);
        /*
         * "Your current area" was not an answer. It confirmed the tap and said
         * nothing about whether the browser had put them in the right city —
         * and a browser that guesses badly guesses by hundreds of miles. Named
         * now, from the rounded point, so a wrong one is obvious.
         */
        setLabel("Finding where that is…");
        setAsking(false);
        void nameThisPlace(rounded.lat, rounded.lng).then((named) => {
          setLabel(named.label ?? "Your current area");
        });
      },
      () => {
        setAsking(false);
        setDeviceError("No location from this device. Type a postcode below instead.");
      },
      // A city-scale answer. High accuracy costs battery and a GPS lock for
      // precision this product deliberately throws away.
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--text-dim)]">
          Roughly where you are
        </p>

        {point ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[17px]">
              {label ?? "Location set"} <span className="text-[var(--sage-text)]">✓</span>
            </p>
            <button
              type="button"
              onClick={() => {
                setPoint(null);
                setLabel(null);
              }}
              className="text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4 hover:text-[var(--text-primary)]"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={useMyLocation}
              aria-busy={asking}
              className="rounded-md border border-[var(--border)] px-4 py-2.5 text-[15px] transition-colors hover:border-[var(--text-dim)]"
            >
              {asking ? "Asking…" : "Use my location"}
            </button>

            <div className="flex flex-wrap items-end gap-2">
              <label className="flex-1">
                <span className="mb-1 block text-[13px] text-[var(--text-dim)]">
                  or type a postcode or town
                </span>
                <input
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  onKeyDown={(event) => {
                    // Enter here means "look this up", not "submit the
                    // application step" — which is what it would do otherwise.
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    findPlace();
                  }}
                  placeholder="30308"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 text-[15px]"
                />
              </label>
              <button
                type="button"
                onClick={findPlace}
                disabled={looking || typed.trim().length < 2}
                className="rounded-md border border-[var(--border)] px-4 py-2.5 text-[15px] transition-colors hover:border-[var(--text-dim)] disabled:opacity-40"
              >
                {looking ? "Looking…" : "Find it"}
              </button>
            </div>
          </div>
        )}

        {(deviceError ?? lookup.error ?? error) && (
          <p role="alert" className="mt-2 text-[15px] leading-snug text-[var(--error)]">
            {deviceError ?? lookup.error ?? error}
          </p>
        )}

        <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-dim)]">
          Kept to about a hundred metres &mdash; enough to know who&rsquo;s near you, never enough
          to find your door. Nobody is ever shown how far away you are as a number.
        </p>
      </div>

      {/* The values the funnel's own form posts. */}
      <input type="hidden" name="lat" value={point?.lat ?? ""} />
      <input type="hidden" name="lng" value={point?.lng ?? ""} />
      <input type="hidden" name="placeLabel" value={label ?? ""} />

      <fieldset>
        <legend className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--text-dim)]">
          How far you&rsquo;d travel
        </legend>
        <div className="flex flex-wrap gap-2">
          {options.map((km) => (
            <Chip
              key={km}
              name="travelRadiusKm"
              type="radio"
              value={String(km)}
              label={formatRadius(km, unit)}
              checked={selected === km}
              onChange={() => setPickedRadius(km)}
            />
          ))}
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-dim)]">
          Both people have to be willing, so the shorter of the two decides. A small number means
          fewer nights with anyone in them.
        </p>
      </fieldset>
    </div>
  );
}
