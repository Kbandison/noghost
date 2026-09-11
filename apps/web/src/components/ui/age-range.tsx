"use client";

import { useId, useState } from "react";

/**
 * The age range you're open to, as two sliders.
 *
 * Two separate thumbs rather than one dual-range control, because a dual-range
 * built from overlapping inputs is a keyboard trap — the thumb you reach with
 * Tab is whichever happens to be on top, and on a phone the two are impossible
 * to separate once they meet. Two labelled sliders are worse-looking and
 * genuinely usable, and each one is a real `<input type="range">` with its own
 * name, so the form posts exactly what it did before.
 *
 * They cannot cross. Dragging the lower one past the upper pushes the upper
 * along, which is what every range control that works does — the alternative is
 * a silent clamp that makes the thumb feel broken.
 */
export function AgeRange({
  min,
  max,
  defaultMin,
  defaultMax,
}: {
  min: number;
  max: number;
  defaultMin: number;
  defaultMax: number;
}) {
  const lowId = useId();
  const highId = useId();
  const [low, setLow] = useState(defaultMin);
  const [high, setHigh] = useState(defaultMax);

  const span = max - min || 1;
  const pctLow = ((low - min) / span) * 100;
  const pctHigh = ((high - min) / span) * 100;

  return (
    <div>
      <p className="mb-3 text-[19px]">
        <strong className="tabular font-semibold">{low}</strong>
        <span className="mx-2 text-[var(--text-dim)]">to</span>
        <strong className="tabular font-semibold">{high}</strong>
        {high >= max && <span className="text-[var(--text-dim)]">+</span>}
      </p>

      {/* The chosen span, drawn once for both sliders. */}
      <div
        aria-hidden="true"
        className="relative mb-4 h-[3px] rounded-full bg-[var(--border)]"
      >
        <div
          className="absolute h-full rounded-full bg-[var(--accent)]"
          style={{ left: `${pctLow}%`, right: `${100 - pctHigh}%` }}
        />
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor={lowId} className="text-[13px] text-[var(--text-dim)]">
            Youngest
          </label>
          <input
            id={lowId}
            name="ageMin"
            type="range"
            min={min}
            max={max}
            value={low}
            onChange={(e) => {
              const next = Number(e.target.value);
              setLow(next);
              // Push rather than clamp, so the thumb never feels stuck.
              if (next > high) setHigh(next);
            }}
            className="mt-1 w-full accent-[var(--accent)]"
          />
        </div>

        <div>
          <label htmlFor={highId} className="text-[13px] text-[var(--text-dim)]">
            Oldest
          </label>
          <input
            id={highId}
            name="ageMax"
            type="range"
            min={min}
            max={max}
            value={high}
            onChange={(e) => {
              const next = Number(e.target.value);
              setHigh(next);
              if (next < low) setLow(next);
            }}
            className="mt-1 w-full accent-[var(--accent)]"
          />
        </div>
      </div>
    </div>
  );
}
