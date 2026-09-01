"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AUDIO_BITS_PER_SECOND, MAX_DURATION_MS, baseMimeType } from "@/lib/voice";
import { cn } from "@/lib/utils";

export interface Recording {
  /** Identifies this take, so a send can be matched to the thing it sent. */
  id: string;
  blob: Blob;
  durationMs: number;
  /** Object URL for the preview player. The owner revokes it. */
  url: string;
}

type Phase = "idle" | "asking" | "recording";

/** Longer than this and a press reads as a hold rather than a tap. */
const HOLD_MS = 500;

/**
 * Whether this browser can record at all.
 *
 * `useSyncExternalStore` rather than an effect, because the answer is a static
 * property of the environment that React has no business owning. The server
 * snapshot is `true` — assume the control belongs on the page — and a browser
 * without `MediaRecorder` drops it during hydration. Reading `window` in render
 * instead would be a hydration mismatch; discovering it in an effect would be a
 * setState in an effect body for a value that never changes.
 */
const NEVER_CHANGES = () => () => {};
const supportsRecording = () => typeof window.MediaRecorder !== "undefined";
const assumeSupported = () => true;

/**
 * Hold-to-record, or tap-to-record — spec §7.2 and §7.3.
 *
 * §7.2 says "composer with hold-to-record", which is a phone gesture. Held to
 * the letter on the web it excludes a keyboard entirely: there is no way to
 * hold Enter down and have a button understand it as a gesture rather than as
 * key repeat. So both work here, from the same control:
 *
 *   press and hold, release after HOLD_MS  → records while held (the spec's
 *                                          gesture, and what a thumb expects)
 *   tap                                  → starts; tap again to stop
 *   Enter or Space                       → the same toggle, from the keyboard
 *
 * The keyboard path is separated by `event.detail === 0`, which is how a
 * synthetic click from a key press is distinguished from a real pointer click —
 * without it a mouse tap would start on `pointerdown` and immediately stop on
 * the `click` that follows.
 */
export function VoiceRecorder({
  onRecorded,
  disabled,
  maxMs = MAX_DURATION_MS,
}: {
  onRecorded: (recording: Recording) => void;
  disabled?: boolean;
  /** Defaults to a chat note's minute; the profile intro passes thirty seconds. */
  maxMs?: number;
}) {
  const supported = useSyncExternalStore(NEVER_CHANGES, supportsRecording, assumeSupported);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const pressedAtRef = useRef(0);
  /** Did *this* press start the recording, or arrive while one was running? */
  const pressStartedItRef = useRef(false);
  /** Released before the microphone was granted; stop the moment it is. */
  const stopWhenReadyRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Releasing the tracks is not optional housekeeping. A `MediaStream` left
   * open keeps the browser's recording indicator lit and the microphone claimed
   * for the rest of the session, which reads to the person using it as an app
   * that is still listening.
   */
  const release = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (capRef.current) clearTimeout(capRef.current);
    tickRef.current = null;
    capRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => () => release(), [release]);

  const stop = useCallback(() => {
    // `stop()` fires `dataavailable` then `stop`, where the blob is assembled.
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (phase !== "idle") return;
    setError(null);
    setPhase("asking");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (cause) {
      setPhase("idle");
      // Named separately because they need different things from the person:
      // one is a decision they can change, the other is hardware.
      const name = cause instanceof DOMException ? cause.name : "";
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Your browser is blocking the microphone. Allow it for this site and try again."
          : "No microphone available. You can still write.",
      );
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    /*
     * `audioBitsPerSecond` is a request, not a guarantee — a browser may ignore
     * it. The duration cap is the backstop that keeps the payload inside the
     * Server Action body limit either way.
     */
    const recorder = new MediaRecorder(stream, { audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const durationMs = Math.min(Date.now() - startedAtRef.current, maxMs);
      // Chromium reports `audio/webm;codecs=opus`; the blob keeps the full
      // string, and the server maps it down to a bucket-allowed base type.
      const type = recorder.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      release();
      setPhase("idle");
      setElapsed(0);

      // Under a moment is a mis-tap, not a message. Sending it would put a
      // half-second of nothing in front of the other person.
      if (durationMs < 700 || blob.size === 0) {
        setError("That was too short to send. Hold a little longer.");
        return;
      }
      onRecorded({
        id: crypto.randomUUID(),
        blob,
        durationMs,
        url: URL.createObjectURL(blob),
      });
    };

    startedAtRef.current = Date.now();
    recorder.start();
    setPhase("recording");
    setElapsed(0);

    tickRef.current = setInterval(() => setElapsed(Date.now() - startedAtRef.current), 100);
    capRef.current = setTimeout(stop, maxMs);

    // Held down and released while the permission prompt was still up. Without
    // this the gesture ends and the recording carries on, which is the one
    // failure mode a hold-to-record control must not have.
    if (stopWhenReadyRef.current) {
      stopWhenReadyRef.current = false;
      stop();
    }
  }, [maxMs, onRecorded, phase, release, stop]);

  if (!supported) {
    return (
      <p className="text-[14px] text-[var(--text-dim)]">
        This browser can&rsquo;t record audio. Writing works everywhere.
      </p>
    );
  }

  const recording = phase === "recording";
  const remaining = Math.max(0, maxMs - elapsed);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        /*
         * Not disabled while the permission prompt is up, though it is doing
         * nothing useful in that moment. A browser blurs an element the instant
         * it becomes disabled, so disabling here moved focus to the body
         * mid-gesture: a keyboard user could press Enter to start and then had
         * nothing focused to press Enter on to stop. `aria-busy` says the same
         * thing without taking the focus away, and the handlers already refuse
         * to start twice by checking the phase.
         */
        disabled={disabled}
        aria-busy={phase === "asking"}
        aria-pressed={recording}
        onPointerDown={(event) => {
          if (disabled) return;
          pressedAtRef.current = event.timeStamp;
          pressStartedItRef.current = phase === "idle";
          if (phase === "idle") void start();
        }}
        onPointerUp={(event) => {
          /*
           * Two ways a press ends a recording, and both are needed:
           *
           *   held past HOLD_MS  the gesture is over — this is hold-to-record
           *   a later press      a tap while already recording is the stop tap
           *
           * The second clause is the one that is easy to leave out. Without it
           * only a *long* press could stop, so a quick tap to start followed by
           * a quick tap to stop left the recording running with no way to end
           * it — the tap-to-toggle half of this control simply did not work.
           */
          const held = event.timeStamp - pressedAtRef.current > HOLD_MS;
          if (phase === "asking" && held) {
            stopWhenReadyRef.current = true;
            return;
          }
          if (phase !== "recording") return;
          if (held || !pressStartedItRef.current) stop();
        }}
        onPointerCancel={() => {
          if (phase === "recording") stop();
        }}
        onClick={(event) => {
          // Keyboard only. `detail === 0` is a click synthesised from Enter or
          // Space; a pointer click has already been handled above, and letting
          // it through here would stop the recording its own pointerdown began.
          if (event.detail !== 0) return;
          if (phase === "recording") stop();
          else if (phase === "idle") void start();
        }}
        className={cn(
          "inline-flex items-center gap-2 rounded-md border px-4 py-2.5 text-[15px] transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]",
          "disabled:cursor-not-allowed disabled:opacity-40",
          recording
            ? "border-[var(--fuse-urgent)] bg-[var(--fuse-urgent)]/12 text-[var(--fuse-urgent)]"
            : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-dim)]",
        )}
      >
        <Mic recording={recording} />
        {recording ? "Recording — release or tap to stop" : "Record a voice note"}
      </button>

      {recording && (
        <p
          className="text-[15px] tabular-nums text-[var(--text-secondary)]"
          role="timer"
          aria-live="off"
        >
          {formatSeconds(elapsed)}
          <span className="ml-2 text-[var(--text-dim)]">
            {Math.ceil(remaining / 1000)}s left
          </span>
        </p>
      )}

      {error && (
        <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
          {error}
        </p>
      )}
    </div>
  );
}

function Mic({ recording }: { recording: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" aria-hidden="true" fill="none">
      <rect
        x="7"
        y="2"
        width="6"
        height="10"
        rx="3"
        fill={recording ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function formatSeconds(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Exported for the send path, which must not trust the browser's mime string. */
export { baseMimeType };
