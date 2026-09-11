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
 * ---------------------------------------------------------------------------
 * Two different questions, and only one of them is private
 * ---------------------------------------------------------------------------
 *
 * The first version of this screen told the applicant nothing at all: the
 * shutter was silent, no frame appeared, and the only sign anything had
 * happened was the instruction text changing. The first person to walk it said
 * they had not realised it was taking photographs, could not tell when one was
 * taken, and only learned anything at the very end.
 *
 * That came from collapsing two questions that are not the same:
 *
 *   "Did the camera fire?"    — ordinary feedback, and withholding it is just
 *                               a broken interface.
 *   "Did you pass?"           — genuinely private. Telling somebody which frame
 *                               was rejected teaches them how to aim the next
 *                               attempt, and an honest applicant with a poor
 *                               camera reads "liveness check failed" as an
 *                               accusation.
 *
 * So: a countdown before each shot, a flash and a held still when it is taken,
 * and the frames stacking up where you can see them. And at the end, the
 * *absence* of a verdict is explained rather than left blank — "a person checks
 * these" is the honest account of what happens next, and it stops a silent
 * screen reading as a failure.
 */

const INSTRUCTIONS: Record<ChallengePose, { title: string; hint: string }> = {
  center: { title: "Look straight at the camera", hint: "Whole face in frame, eyes open" },
  left: { title: "Turn your head to the left", hint: "Keep your eyes on the screen" },
  right: { title: "Turn your head to the right", hint: "Keep your eyes on the screen" },
  smile: { title: "Smile", hint: "A real one — teeth showing helps" },
};

type Phase =
  | "idle"
  | "starting"
  | "ready"
  | "counting"
  | "capturing"
  | "uploading"
  | "done"
  | "failed";

/** Long enough to get your head round; short enough not to be a wait. */
const COUNT_FROM = 3;
/** How long the captured still is held on screen before the next instruction. */
const HOLD_MS = 900;

const initial: CaptureState = {};

interface Frame {
  path: string;
  /** Object URL for the thumbnail. Revoked when the component lets go. */
  preview: string;
}

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
  const [frames, setFrames] = useState<Frame[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const previewsRef = useRef<string[]>([]);

  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  };

  /*
   * Releasing the tracks is not housekeeping. A `MediaStream` left open keeps
   * the camera light on for the rest of the session, which reads as an app that
   * is still watching — on a screen that just asked somebody to turn their face
   * both ways, that is the worst possible impression to leave.
   */
  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  useEffect(
    () => () => {
      release();
      previewsRef.current.forEach(URL.revokeObjectURL);
    },
    [release],
  );

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
      setTrouble("We couldn't reach your camera. Allow access in your browser, then try again.");
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

  /** Count down, so nobody is photographed mid-blink or mid-turn. */
  function takeShot() {
    setTrouble(null);
    setPhase("counting");
    setCount(COUNT_FROM);

    for (let n = COUNT_FROM - 1; n >= 1; n -= 1) {
      later(() => setCount(n), (COUNT_FROM - n) * 1000);
    }
    later(() => {
      setCount(null);
      void capture();
    }, COUNT_FROM * 1000);
  }

  async function capture() {
    setPhase("capturing");

    const file = await grabFrame();
    if (!file) {
      setPhase("ready");
      setTrouble("The camera didn't give us a frame. Try again.");
      return;
    }

    // Shutter: a flash and the still held on screen, so the moment the photo
    // was taken is unmistakable and you can see what it caught.
    const preview = URL.createObjectURL(file);
    previewsRef.current.push(preview);
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) {
      setFlash(true);
      later(() => setFlash(false), 130);
    }
    setHeld(preview);

    setPhase("uploading");
    let path: string;
    try {
      path = await uploadImage("verification-selfies", file);
    } catch (cause) {
      setHeld(null);
      setPhase("ready");
      setTrouble(cause instanceof Error ? cause.message : "That frame didn't upload.");
      return;
    }

    const next = [...frames, { path, preview }];
    setFrames(next);

    later(() => {
      setHeld(null);

      if (next.length < poses.length) {
        setStep(next.length);
        setPhase("ready");
        return;
      }

      // Every frame is in. Hand them over and let the camera go.
      release();
      const data = new FormData();
      data.set("challengeId", challengeId ?? "");
      for (const frame of next) data.append("framePaths", frame.path);
      startTransition(() => submitAction(data));
    }, HOLD_MS);
  }

  function retake() {
    release();
    previewsRef.current.forEach(URL.revokeObjectURL);
    previewsRef.current = [];
    setFrames([]);
    setPoses([]);
    setStep(0);
    setChallengeId(null);
    setHeld(null);
    setCount(null);
    setPhase("idle");
    setTrouble(null);
  }

  const pose = poses[step];
  const message = trouble ?? submitted.error ?? error;
  const total = poses.length || 3;

  if (phase === "done") {
    return (
      <div className="space-y-4">
        <div className="border border-[var(--border)] p-4">
          <p className="text-[15px] font-medium" aria-live="polite">
            {frames.length || 3} photos taken <span className="text-[var(--sage-text)]">✓</span>
          </p>
          {/*
           * Why there is no verdict here, said out loud.
           *
           * Whether the automated check passed is deliberately not shown — see
           * the note at the top. But an unexplained silence reads as a broken
           * screen, so this says what actually happens next instead. It is the
           * truth either way: a person reviews every application.
           */}
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-dim)]">
            A person on the review team compares these with your photos before you&rsquo;re
            admitted, and you&rsquo;ll hear back either way. They&rsquo;re never shown on your
            profile or to another member.
          </p>
          <button
            type="button"
            onClick={retake}
            className="mt-3 text-[14px] text-[var(--accent-text)] underline underline-offset-4"
          >
            Take them again
          </button>
        </div>

        {frames.length > 0 && (
          <ul className="flex gap-2" aria-label="Photos you just took">
            {frames.map((frame) => (
              <li
                key={frame.path}
                className="h-16 w-16 overflow-hidden rounded-md border border-[var(--border)]"
              >
                {/* Local object URL; nothing for next/image to optimise. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={frame.preview} alt="" className="h-full w-full scale-x-[-1] object-cover" />
              </li>
            ))}
          </ul>
        )}

        {/* The centered frame — what `validateSelfie` checks for and what the
            reviewer compares against the photos. The rest are on the
            verification row already, written by `submitCapture`. */}
        <input type="hidden" name="selfiePath" value={frames[0]?.path ?? existingPath ?? ""} />
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

        {/* The still, held over the live feed — "this is what we just took". */}
        {held && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={held}
            alt=""
            className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"
          />
        )}

        {flash && <div aria-hidden="true" className="absolute inset-0 bg-white/85" />}

        {count !== null && (
          <div
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center bg-black/25"
          >
            <span className="font-[family-name:var(--font-display)] text-[72px] font-extrabold leading-none text-white drop-shadow">
              {count}
            </span>
          </div>
        )}

        {phase === "idle" && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-[14px] text-[var(--text-dim)]">
            Your camera will open here.
          </div>
        )}
      </div>

      {/* How many photos, and which ones are already taken. Visible from the
          start so "it's photographs, and there are three" is never a surprise. */}
      <ol className="flex items-center gap-2" aria-label={`Photo ${frames.length} of ${total} taken`}>
        {Array.from({ length: total }, (_, index) => {
          const frame = frames[index];
          const current = index === frames.length && phase !== "idle" && phase !== "starting";
          return (
            <li
              key={index}
              className={
                frame
                  ? "h-12 w-12 overflow-hidden rounded-md border border-[var(--sage)]"
                  : current
                    ? "h-12 w-12 rounded-md border-2 border-dashed border-[var(--accent)]"
                    : "h-12 w-12 rounded-md border border-dashed border-[var(--border)]"
              }
            >
              {frame && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={frame.preview}
                  alt=""
                  className="h-full w-full scale-x-[-1] object-cover"
                />
              )}
            </li>
          );
        })}
        <span className="ml-1 text-[13px] text-[var(--text-dim)]" aria-hidden="true">
          {frames.length} of {total}
        </span>
      </ol>

      {pose && (phase === "ready" || phase === "counting" || phase === "capturing" || phase === "uploading") && (
        <div aria-live="polite">
          <p className="text-[20px] font-semibold">{INSTRUCTIONS[pose].title}</p>
          <p className="mt-0.5 text-[15px] text-[var(--text-secondary)]">
            {phase === "uploading" ? "Saving that one…" : INSTRUCTIONS[pose].hint}
          </p>
        </div>
      )}

      {message && (
        <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
          {message}
        </p>
      )}

      {phase === "idle" || phase === "starting" ? (
        <>
          <p className="text-[15px] leading-relaxed text-[var(--text-secondary)]">
            We&rsquo;ll take <strong>three photos</strong>, one at a time. Before each one
            we&rsquo;ll tell you which way to face and count down from three, so you can get
            ready.
          </p>
          <button
            type="button"
            onClick={() => void start()}
            disabled={phase === "starting"}
            className="w-full rounded-md border border-[var(--border)] px-4 py-3 text-[16px] transition-colors hover:border-[var(--text-dim)] disabled:opacity-40"
          >
            {phase === "starting" ? "Opening the camera…" : "Start"}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={takeShot}
          disabled={phase !== "ready"}
          className="w-full rounded-md border border-[var(--border)] px-4 py-3 text-[16px] transition-colors hover:border-[var(--text-dim)] disabled:opacity-40"
        >
          {phase === "counting"
            ? `Taking the photo in ${count}…`
            : phase === "uploading"
              ? "Saving…"
              : phase === "capturing"
                ? "…"
                : `Take photo ${frames.length + 1} of ${total}`}
        </button>
      )}

      <p className="text-[13px] leading-relaxed text-[var(--text-dim)]">
        These go to the review team and nowhere else. They are never shown on your profile, never
        shown to another member, and you can ask us to delete them.
      </p>
    </div>
  );
}
