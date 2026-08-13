"use client";

import { useCallback, useId, useRef, useState } from "react";
import { formatSeconds } from "./voice-recorder";
import { cn } from "@/lib/utils";

const BARS = 48;

/**
 * A voice note, with the waveform scrub §7.3 specifies.
 *
 * The waveform is computed here rather than stored. `messages` has `voice_path`
 * and `voice_duration_ms` and nowhere to put peaks, and adding a column for a
 * decoration would be the tail wagging the dog — so the peaks come from
 * decoding the audio in the browser.
 *
 * Decoding happens on first play, not on mount. A thread can hold a dozen
 * notes, and fetching and decoding every one of them to draw a picture nobody
 * asked for would spend bandwidth on audio the reader may never listen to. Bars
 * are flat until then, and the scrub works the whole time regardless: it is
 * driven by `currentTime`, not by the drawing.
 *
 * `preload="none"` for the same reason. A private note is fetched when somebody
 * decides to hear it.
 */
export function VoicePlayer({
  src,
  durationMs,
  mine,
  className,
}: {
  /** A short-lived signed URL, or null when the object could not be signed. */
  src: string | null;
  durationMs: number | null;
  mine?: boolean;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [failed, setFailed] = useState(false);
  const labelId = useId();

  /*
   * Two sources, and the recorded one is the fallback rather than the state.
   *
   * `voice_duration_ms` is the browser's stopwatch, written at record time and
   * available before a single byte is fetched, so it is what the label shows
   * while the audio is still `preload="none"`. Once the element has metadata,
   * its own measurement is better. Mirroring the prop into state through an
   * effect would say the same thing with a render in between.
   */
  const [measured, setMeasured] = useState<number | null>(null);
  const duration = measured ?? (durationMs ?? 0) / 1000;

  const loadPeaks = useCallback(async () => {
    if (!src || peaks) return;
    try {
      const response = await fetch(src);
      const bytes = await response.arrayBuffer();
      // `webkitAudioContext` is gone from every browser this app supports; the
      // standard constructor is enough.
      const context = new AudioContext();
      const audio = await context.decodeAudioData(bytes);
      const channel = audio.getChannelData(0);
      const per = Math.floor(channel.length / BARS) || 1;

      const next: number[] = [];
      for (let bar = 0; bar < BARS; bar += 1) {
        let peak = 0;
        for (let i = bar * per; i < (bar + 1) * per && i < channel.length; i += 1) {
          const value = Math.abs(channel[i] ?? 0);
          if (value > peak) peak = value;
        }
        next.push(peak);
      }
      void context.close();

      // Normalised against the loudest bar so a quietly-recorded note still
      // reads as a shape rather than as a flat line.
      const loudest = Math.max(...next, 0.01);
      setPeaks(next.map((value) => value / loudest));
    } catch {
      // A waveform is decoration. If decoding fails — an unsupported container,
      // a signed URL that expired mid-session — playback still works, and the
      // flat bars remain a usable scrubber.
    }
  }, [peaks, src]);

  if (!src) {
    return (
      <p className={cn("text-[15px] italic text-[var(--text-dim)]", className)}>
        This voice note can&rsquo;t be played right now.
      </p>
    );
  }

  const progress = duration > 0 ? Math.min(current / duration, 1) : 0;

  const seek = (fraction: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(duration) || duration <= 0) return;
    audio.currentTime = Math.max(0, Math.min(fraction, 1)) * duration;
    setCurrent(audio.currentTime);
  };

  return (
    <div
      className={cn(
        "flex max-w-[80%] items-center gap-3 rounded-lg px-4 py-3",
        mine
          ? "ml-auto bg-[var(--accent)]/12"
          : "border border-[var(--border-subtle)] bg-[var(--bg-secondary)]",
        className,
      )}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          // A webm from MediaRecorder often reports `Infinity` until it has been
          // seeked; the recorded duration from the database is the honest one.
          if (Number.isFinite(value) && value > 0) setMeasured(value);
        }}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onError={() => setFailed(true)}
      />

      <button
        type="button"
        onClick={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (playing) {
            audio.pause();
          } else {
            void loadPeaks();
            void audio.play().catch(() => setFailed(true));
          }
        }}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className="shrink-0 rounded-full border border-[var(--border)] p-2 text-[var(--text-primary)] transition-colors hover:border-[var(--text-dim)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]"
      >
        {playing ? <Pause /> : <Play />}
      </button>

      <div className="min-w-0 flex-1">
        <span id={labelId} className="sr-only">
          Voice note, {formatSeconds(duration * 1000)} long
        </span>
        {/*
          A real slider, so arrow keys scrub and a screen reader announces a
          position. The bars are painted behind it and are `aria-hidden` —
          a waveform is a picture of the same number the slider already reports.
        */}
        <div className="relative h-8">
          <div className="absolute inset-0 flex items-center gap-[2px]" aria-hidden="true">
            {Array.from({ length: BARS }, (_, i) => {
              // Floored well above zero: a pause between sentences is a quiet
              // bar, not a gap. At 0.08 a note with any silence in it rendered
              // as a dotted line with spikes rather than as a waveform.
              const height = peaks ? Math.max(peaks[i] ?? 0, 0.18) : 0.35;
              return (
                <span
                  key={i}
                  className={cn(
                    "flex-1 rounded-[1px] transition-colors",
                    i / BARS <= progress ? "bg-[var(--accent)]" : "bg-[var(--border)]",
                  )}
                  style={{ height: `${Math.round(height * 100)}%` }}
                />
              );
            })}
          </div>
          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            value={Math.round(progress * 1000)}
            aria-labelledby={labelId}
            aria-valuetext={`${formatSeconds(current * 1000)} of ${formatSeconds(duration * 1000)}`}
            onChange={(event) => seek(Number(event.target.value) / 1000)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>

        <p className="mt-0.5 text-[13px] tabular-nums text-[var(--text-dim)]">
          {failed
            ? "That didn't play."
            : `${formatSeconds(current * 1000)} / ${formatSeconds(duration * 1000)}`}
        </p>
      </div>
    </div>
  );
}

function Play() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <path d="M4.5 3.2v9.6a.6.6 0 0 0 .92.5l7.3-4.8a.6.6 0 0 0 0-1l-7.3-4.8a.6.6 0 0 0-.92.5Z" fill="currentColor" />
    </svg>
  );
}

function Pause() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <rect x="4" y="3" width="3.2" height="10" rx="1" fill="currentColor" />
      <rect x="8.8" y="3" width="3.2" height="10" rx="1" fill="currentColor" />
    </svg>
  );
}
