"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
/*
 * The component's own stylesheet, and it is not optional.
 *
 * Without it the thing renders as a stack of unstyled boxes: the instructions
 * overflow, and the oval that is supposed to sit *over* the camera preview
 * lands underneath it as a white blob on black. It looks broken because it is
 * — every rule that positions the overlay lives in here.
 *
 * Imported in this file rather than a global so it rides along with the dynamic
 * import. 330KB of CSS on the eight screens that do not use a camera would be a
 * poor trade.
 */
import "@aws-amplify/ui-react-liveness/styles.css";
import {
  startLiveness,
  finishLiveness,
  type LivenessStart,
} from "@/app/(apply)/apply/start/verify-actions";

/**
 * A short video, judged by Amazon Rekognition Face Liveness.
 *
 * Two things stood here before. A `<input type="file" capture="user">`, which
 * reads as a liveness check and is not one. Then a pose challenge — three
 * stills answering a server-issued sequence, which genuinely defeats a stolen
 * photograph and was honest that it defeated nothing beyond it.
 *
 * The first person to walk that version said "I also thought it was a live
 * capture", which was both a fair description of what they expected and a fair
 * description of what this product needs. A screen held up to the camera, a
 * printed mask, or video injected into the stream all beat three photographs.
 * They do not beat this.
 *
 * ---------------------------------------------------------------------------
 * What the browser is trusted with, and what it is not
 * ---------------------------------------------------------------------------
 *
 * The video streams from the device straight to Rekognition and never touches
 * us — faster, and one less place a recording of somebody's face could sit. To
 * do that the page has to sign its own requests, so the server mints temporary
 * credentials narrowed by a session policy to `StartFaceLivenessSession` and
 * nothing else. They last fifteen minutes and cannot read a face, compare one,
 * or look up the result of the session they just streamed.
 *
 * The verdict is asked of AWS by the server, keyed on a session id. This
 * component never sees a confidence score and could not forge one if it did.
 */

/*
 * Loaded only when somebody reaches this step.
 *
 * The Amplify liveness component brings a large dependency tree and a WebAssembly
 * face tracker with it. Every applicant walks nine screens and only one of them
 * is this, so putting that in the shared bundle would make eight screens slower
 * for a feature they are not using yet. `ssr: false` because it wants a camera.
 */
const FaceLivenessDetectorCore = dynamic(
  () => import("@aws-amplify/ui-react-liveness").then((m) => m.FaceLivenessDetectorCore),
  { ssr: false, loading: () => <Waiting>Getting the camera ready…</Waiting> },
);

function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex aspect-[3/4] w-full items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-6 text-center text-[14px] text-[var(--text-dim)]">
      {children}
    </div>
  );
}

/*
 * Served from our own origin rather than the component's defaults.
 *
 * Out of the box it fetches its WebAssembly backend from jsDelivr and its face
 * model from tfhub.dev — which now 302s to Kaggle. That is a third-party
 * redirect chain in the critical path of identity verification: if it is
 * blocked, slow, or moved again, nobody can verify. The files are 1.4MB and sit
 * in `public/`, so this depends on nothing we do not serve.
 */
const SELF_HOSTED = {
  binaryPath: "/tfjs-wasm/",
  faceModelUrl: "/face-model/model.json",
};

/*
 * Amplify's own theme, re-pointed at NoGhost's.
 *
 * The component reads `--amplify-*` custom properties, so this is a translation
 * layer rather than a fight with its stylesheet: set them on the wrapper and
 * everything inside inherits. Left alone it arrives in Amplify's blue-and-grey,
 * which in the middle of a warm serif funnel reads as a third-party widget
 * somebody embedded — which is exactly what it is, and exactly what it should
 * not look like.
 */
const AMPLIFY_THEME: React.CSSProperties = {
  "--amplify-fonts-default-variable": "var(--font-sans)",
  "--amplify-fonts-default-static": "var(--font-sans)",
  "--amplify-colors-background-primary": "var(--bg-primary)",
  "--amplify-colors-background-secondary": "var(--bg-secondary)",
  "--amplify-colors-background-tertiary": "var(--bg-secondary)",
  "--amplify-colors-font-primary": "var(--text-primary)",
  "--amplify-colors-font-secondary": "var(--text-secondary)",
  "--amplify-colors-font-tertiary": "var(--text-dim)",
  "--amplify-colors-border-primary": "var(--border)",
  "--amplify-colors-border-secondary": "var(--border-subtle)",
  "--amplify-colors-border-focus": "var(--accent-text)",
  // The primary button, and the oval's own accent while it tracks a face.
  "--amplify-colors-brand-primary-10": "var(--accent-wash, var(--bg-secondary))",
  "--amplify-colors-brand-primary-80": "var(--accent)",
  "--amplify-colors-brand-primary-90": "var(--accent-hover)",
  "--amplify-colors-brand-primary-100": "var(--accent-hover)",
  "--amplify-colors-primary-80": "var(--accent)",
  "--amplify-colors-primary-90": "var(--accent-hover)",
  "--amplify-components-button-primary-background-color": "var(--accent)",
  "--amplify-components-button-primary-color": "var(--on-accent)",
  "--amplify-radii-small": "3px",
  "--amplify-radii-medium": "4px",
  "--amplify-radii-large": "6px",
} as React.CSSProperties;

type Phase = "idle" | "starting" | "streaming" | "checking" | "done" | "unavailable";

export function LivenessCapture({
  existingPath,
  error,
}: {
  existingPath?: string;
  error?: string;
}) {
  const [phase, setPhase] = useState<Phase>(existingPath ? "done" : "idle");
  const [session, setSession] = useState<LivenessStart | null>(null);
  const [selfiePath, setSelfiePath] = useState<string | null>(existingPath ?? null);
  const [trouble, setTrouble] = useState<string | null>(null);

  async function start() {
    setTrouble(null);
    setPhase("starting");

    const opened = await startLiveness();
    if (opened.unavailable) {
      // AWS is not wired up here. Say so plainly and let them past — §7.3's
      // reviewer was always the backstop, and this is the state that falls
      // back to it.
      setPhase("unavailable");
      return;
    }
    if (opened.error || !opened.sessionId) {
      setPhase("idle");
      setTrouble(opened.error ?? "We couldn't start the check.");
      return;
    }

    setSession(opened);
    setPhase("streaming");
  }

  /*
   * Rekognition has finished with the video. The session, its score and its
   * images all expire three minutes after it opened, so this asks for them
   * immediately rather than at the end of the funnel.
   */
  const collect = useCallback(async () => {
    setPhase("checking");
    const finished = await finishLiveness(session?.sessionId ?? "");

    if (!finished.ok) {
      setSession(null);
      setPhase("idle");
      setTrouble(finished.error ?? "That didn't work. Try again.");
      return;
    }

    setSelfiePath(finished.selfiePath ?? null);
    setPhase("done");
  }, [session?.sessionId]);

  const credentialProvider = useCallback(async () => {
    const c = session?.credentials;
    if (!c) throw new Error("No credentials for this session.");
    return {
      accessKeyId: c.accessKeyId,
      secretAccessKey: c.secretAccessKey,
      sessionToken: c.sessionToken,
      expiration: c.expiration ? new Date(c.expiration) : undefined,
    };
  }, [session?.credentials]);

  const message = trouble ?? error;

  if (phase === "done") {
    return (
      <div className="space-y-4">
        <div className="border border-[var(--border)] p-4">
          <p className="text-[15px] font-medium" aria-live="polite">
            Check complete <span className="text-[var(--sage-text)]">✓</span>
          </p>
          {/*
           * Why there is no score here, said out loud.
           *
           * Whether the check was convincing is deliberately not shown — an
           * applicant who learns the number learns what to aim at, and an
           * honest applicant told "you failed a liveness check" reads it as an
           * accusation. But an unexplained silence reads as a broken screen, so
           * this says what actually happens next. It is true either way: a
           * person reviews every application.
           */}
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-dim)]">
            A person on the review team compares this with your photos before you&rsquo;re
            admitted, and you&rsquo;ll hear back either way. Nothing from it is shown on your
            profile or to another member.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelfiePath(null);
              setSession(null);
              setPhase("idle");
            }}
            className="mt-3 text-[14px] text-[var(--accent-text)] underline underline-offset-4"
          >
            Do it again
          </button>
        </div>
        <input type="hidden" name="selfiePath" value={selfiePath ?? ""} />
      </div>
    );
  }

  if (phase === "unavailable") {
    return (
      <div className="space-y-4">
        <div className="border border-[var(--border)] p-4">
          <p className="text-[15px]">Identity checks aren&rsquo;t switched on here.</p>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-dim)]">
            Carry on — a person on the review team will check your photos by hand before
            you&rsquo;re admitted, which is what happens to every application anyway.
          </p>
        </div>
        {/* Nothing to post. `validateSelfie` lets the step through on its own
            in this state; the reviewer is the check. */}
        <input type="hidden" name="selfiePath" value="unavailable" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {phase === "streaming" && session?.sessionId ? (
        <div
          style={AMPLIFY_THEME}
          className="overflow-hidden rounded-md border border-[var(--border)]"
        >
          <FaceLivenessDetectorCore
            sessionId={session.sessionId}
            region={session.region!}
            onAnalysisComplete={collect}
            onUserCancel={() => {
              setSession(null);
              setPhase("idle");
            }}
            onError={(livenessError) => {
              console.error("[liveness]", livenessError);
              setSession(null);
              setPhase("idle");
              setTrouble(
                "The check didn't finish. Make sure you're somewhere well lit and try again.",
              );
            }}
            config={{ credentialProvider, ...SELF_HOSTED }}
          />
        </div>
      ) : phase === "checking" ? (
        <Waiting>Checking…</Waiting>
      ) : (
        <Waiting>Your camera will open here.</Waiting>
      )}

      {message && (
        <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
          {message}
        </p>
      )}

      {(phase === "idle" || phase === "starting") && (
        <>
          <p className="text-[15px] leading-relaxed text-[var(--text-secondary)]">
            {/* The space before the dash is explicit: JSX drops a lone space
                between an element and the text that follows it, which renders
                as "short video— a few seconds". */}
            A <strong>short video</strong>{" "}
            &mdash; a few seconds. You&rsquo;ll be asked to put your face in an oval and hold
            still while the screen changes colour. That&rsquo;s what tells us a real person is
            there, rather than a photo of one.
          </p>
          <button
            type="button"
            onClick={() => void start()}
            disabled={phase === "starting"}
            className="w-full rounded-md border border-[var(--border)] px-4 py-3 text-[16px] transition-colors hover:border-[var(--text-dim)] disabled:opacity-40"
          >
            {phase === "starting" ? "Getting ready…" : "Start"}
          </button>
        </>
      )}

      <p className="text-[13px] leading-relaxed text-[var(--text-dim)]">
        The video goes straight to our identity checker and is never stored by us. A few still
        frames from it go to the review team and nowhere else — never on your profile, never to
        another member, and you can ask us to delete them.
      </p>
    </div>
  );
}
