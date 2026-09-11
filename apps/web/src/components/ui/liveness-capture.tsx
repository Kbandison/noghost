"use client";

import { startTransition, useActionState, useCallback, useEffect, useRef, useState } from "react";
import type { ChallengePose } from "@noghost/logic";
import {
  issueChallenge,
  submitCapture,
  type CaptureState,
} from "@/app/(apply)/apply/start/verify-actions";
import { uploadImage } from "@/lib/upload";

/**
 * Three photographs, in an order chosen after you sat down.
 *
 * What this replaces was `<input type="file" capture="user">`. On a phone that
 * opens the camera, which reads as a liveness check and is not one — `capture`
 * is a hint about which app to launch, and any picture in the roll satisfies
 * it. On a laptop it is a file picker. The product's strongest identity claim
 * rested on the applicant choosing to cooperate.
 *
 * Here the sequence comes from the server, expires in three minutes, and is
 * single-use. The frames are judged on the server too: this component sends
 * paths, never a verdict. A `passed: true` in a form field would make the whole
 * thing theatre.
 *
 * Nobody is ever told they failed. A rejected frame teaches somebody how to aim
 * the next attempt, and an honest applicant with a bad camera reads "liveness
 * check failed" as an accusation. Everyone continues; the reviewer sees what
 * actually happened.
 */

const INSTRUCTIONS: Record<ChallengePose, { title: string; hint: string }> = {
  center: { title: "Look straight at the camera", hint: "Whole face in frame, eyes open" },
  left: { title: "Turn your head to the left", hint: "Keep your eyes on the screen" },
  right: { title: "Turn your head to the right", hint: "Keep your eyes on the screen" },
  smile: { title: "Smile", hint: "A real one — teeth showing helps" },
};

type Phase = "idle" | "starting" | "ready" | "capturing" | "uploading" | "done" | "failed";

const initial: CaptureState = {};

export function LivenessCapture({
  existingPath,
  error,
}: {
  existingPath?: string;
  error?: string;
}) {
  const [phase, setPhase] = useState<Phase>(existingPath ? "done" : "idle");
  const [poses, setPoses] = useState<ChallengePose[]>([]);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [paths, setPaths] = useState<string[]>(existingPath ? [existingPath] : []);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  /*
   * Releasing the tracks is not housekeeping. A `MediaStream` left open keeps
   * the camera light on for the rest of the session, which reads as an app that
   * is still watching — on a screen that just asked somebody to turn their face
   * both ways, that is the worst possible impression to leave.
   */
  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => release, [release]);

  const [submitted, submitAction] = useActionState(async (prev: CaptureState, fd: FormData) => {
    const result = await submitCapture(prev, fd);
    setPhase(result.ok ? "done" : "failed");
    if (!result.ok) setTrouble(result.error ?? "That didn't work. Try again.");
    return result;
  }, initial);

  async function start() {
    setTrouble(null);
    setPhase("starting");

    const challenge = await issueChallenge();
    if (challenge.error || !challenge.poses) {
      setPhase("idle");
      setTrouble(challenge.error ?? "We couldn't start the check.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setPhase("idle");
      setTrouble(
        "We couldn't reach your camera. Allow access in your browser, then try again.",
      );
      return;
    }

    setChallengeId(challenge.id ?? null);
    setPoses(challenge.poses);
    setStep(0);
    setPhase("ready");
  }

  /** One frame off the live video, as a JPEG file the upload helper accepts. */
  async function grabFrame(): Promise<File | null> {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      // 0.9 rather than the default: Rekognition is being asked about a pose
      // and an open eye, and compression artefacts around the eyes are exactly
      // what turns a real answer into "could not tell".
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (!blob) return null;
    return new File([blob], `frame-${Date.now()}.jpg`, { type: "image/jpeg" });
  }

  async function capture() {
    setPhase("capturing");
    setTrouble(null);

    const file = await grabFrame();
    if (!file) {
      setPhase("ready");
      setTrouble("The camera didn't give us a frame. Try again.");
      return;
    }

    setPhase("uploading");
    let path: string;
    try {
      path = await uploadImage("verification-selfies", file);
    } catch (cause) {
      setPhase("ready");
      setTrouble(cause instanceof Error ? cause.message : "That frame didn't upload.");
      return;
    }

    const next = [...paths, path];
    setPaths(next);

    if (next.length < poses.length) {
      setStep(next.length);
      setPhase("ready");
      return;
    }

    // Every frame is in. Hand them over and let the camera go.
    release();
    const data = new FormData();
    data.set("challengeId", challengeId ?? "");
    for (const p of next) data.append("framePaths", p);
    startTransition(() => submitAction(data));
  }

  function retake() {
    release();
    setPaths([]);
    setPoses([]);
    setStep(0);
    setChallengeId(null);
    setPhase("idle");
    setTrouble(null);
  }

  const pose = poses[step];
  const message = trouble ?? submitted.error ?? error;

  if (phase === "done") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4 border border-[var(--border)] p-4">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--bg-secondary)] text-[22px] text-[var(--sage-text)]"
          >
            ✓
          </span>
          <div className="min-w-0 flex-1">
            {/* Deliberately says nothing about the result. See the note above. */}
            <p className="text-[15px]" aria-live="polite">
              Photos taken.
            </p>
            <button
              type="button"
              onClick={retake}
              className="mt-1 text-[14px] text-[var(--accent-text)] underline underline-offset-4"
            >
              Do it again
            </button>
          </div>
        </div>
        {/* The centered frame — what `validateSelfie` checks for and what the
            reviewer compares against the photos. The rest are on the
            verification row already, written by `submitCapture`. */}
        <input type="hidden" name="selfiePath" value={paths[0] ?? ""} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-secondary)]">
        <video
          ref={videoRef}
          playsInline
          muted
          // Mirrored, because an unmirrored preview makes "turn left" feel like
          // the wrong instruction and people correct themselves into the
          // opposite pose. The uploaded frame is not mirrored.
          className="h-full w-full scale-x-[-1] object-cover"
        />
        {phase === "idle" && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-[14px] text-[var(--text-dim)]">
            Your camera will open here.
          </div>
        )}
      </div>

      {pose && (phase === "ready" || phase === "capturing" || phase === "uploading") && (
        <div aria-live="polite">
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--text-dim)]">
            {step + 1} of {poses.length}
          </p>
          <p className="mt-1 text-[20px] font-semibold">{INSTRUCTIONS[pose].title}</p>
          <p className="mt-0.5 text-[15px] text-[var(--text-secondary)]">
            {INSTRUCTIONS[pose].hint}
          </p>
        </div>
      )}

      {message && (
        <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
          {message}
        </p>
      )}

      {phase === "idle" || phase === "starting" ? (
        <button
          type="button"
          onClick={() => void start()}
          disabled={phase === "starting"}
          className="w-full rounded-md border border-[var(--border)] px-4 py-3 text-[16px] transition-colors hover:border-[var(--text-dim)] disabled:opacity-40"
        >
          {phase === "starting" ? "Opening the camera…" : "Start"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void capture()}
          disabled={phase !== "ready"}
          className="w-full rounded-md border border-[var(--border)] px-4 py-3 text-[16px] transition-colors hover:border-[var(--text-dim)] disabled:opacity-40"
        >
          {phase === "uploading" ? "Sending…" : phase === "capturing" ? "…" : "Take it"}
        </button>
      )}

      <p className="text-[13px] leading-relaxed text-[var(--text-dim)]">
        These go to the review team and nowhere else. They are never shown on your profile, never
        shown to another member, and you can ask us to delete them.
      </p>
    </div>
  );
}
