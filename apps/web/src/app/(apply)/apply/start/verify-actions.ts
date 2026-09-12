"use server";

import { createServiceClient } from "@noghost/db/service";
import { usingSeedData } from "@noghost/config/env";
import { allowRequest } from "@/lib/rate-limit";
import { livenessBrowserCredentials } from "@/lib/aws";
import { assessCapture } from "@noghost/logic";
import {
  createLivenessSession,
  livenessResult,
  faceChecksConfigured,
  frameQuality,
} from "@/lib/rekognition";
import { supabaseServer } from "@/lib/supabase";

/**
 * The two halves of a Face Liveness check — opening a session, and collecting
 * what it found.
 *
 * Both run on the server. `verification_challenges` has RLS on and no policies
 * at all, so an applicant can neither read the row nor write a verdict onto it;
 * everything they can do is stream video to AWS and be told a photo was taken.
 *
 * The video itself never touches us. The browser streams it straight to
 * Rekognition, which is faster and means there is no point in our
 * infrastructure where a recording of somebody's face sits. What comes back is
 * a confidence score and a handful of stills, and those we do keep — in the
 * private bucket, for the reviewer.
 */

export interface LivenessStart {
  sessionId?: string;
  region?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    expiration?: string;
  };
  /** True when AWS is not wired up here — the step says so and moves on. */
  unavailable?: boolean;
  error?: string;
}

export interface LivenessFinish {
  ok?: boolean;
  /** The reference frame's storage path — what `validateSelfie` looks for. */
  selfiePath?: string;
  error?: string;
  /**
   * Set when the camera was measurably not ready — soft frames, still
   * focusing. An invitation to film it again, never a refusal: the capture is
   * kept, scored and reviewable either way, and somebody who ignores this is
   * exactly as admissible as somebody who never saw it.
   *
   * Keyed on the capture and never on the score, which is what lets it exist at
   * all. Advice offered only after a low number IS that number, announced.
   */
  retake?: string;
}

async function currentUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Open a session and hand the browser what it needs to stream.
 *
 * Rate-limited per applicant rather than per address, because the shape of an
 * attack here is one account retrying until something gets through. Six in ten
 * minutes is more than an honest person needs after a camera mishap and far
 * fewer than fishing requires. Each attempt also costs real money, which is its
 * own reason to bound it.
 */
export async function startLiveness(): Promise<LivenessStart> {
  const user = await currentUser();
  if (!user) return { error: "Your session expired. Go back to the code step and verify again." };

  // Seed mode keeps the funnel walkable with nothing provisioned.
  if (usingSeedData() || !faceChecksConfigured()) return { unavailable: true };

  if (!(await allowRequest("verify-challenge", { limit: 6, windowSeconds: 600 }, user.id))) {
    return { error: "That's a lot of attempts. Wait a few minutes and try again." };
  }

  /*
   * Credentials first, session second. Creating the session is the call that
   * costs money and starts a three-minute clock; there is no sense starting
   * either if the browser was never going to be able to stream.
   */
  const credentials = await livenessBrowserCredentials();
  if (!credentials) return { unavailable: true };

  const sessionId = await createLivenessSession();
  if (!sessionId) {
    /*
     * Unavailable, not an error, and this distinction is the whole point.
     *
     * An error leaves the applicant on a screen they cannot get past. Whatever
     * stopped the session — a policy missing `CreateFaceLivenessSession`, a
     * Rekognition outage, a throttle — is a problem on our side, and none of
     * them is a reason to refuse to take somebody's application. A reviewer was
     * always the backstop; this is the state that falls back to them.
     *
     * `createLivenessSession` has already logged the real cause loudly, so the
     * failure is visible to us without being fatal to them.
     */
    return { unavailable: true };
  }

  const { error } = await createServiceClient()
    .from("verification_challenges")
    .insert({
      user_id: user.id,
      liveness_session_id: sessionId,
      // AWS expires the session in three minutes and takes the images with it.
      // Matching that here means a row can never outlive the evidence behind it.
      expires_at: new Date(Date.now() + 180_000).toISOString(),
    });

  if (error) {
    // Same reasoning: logged, not fatal. Without this row the result can never
    // be claimed, so the check cannot silently half-happen either.
    console.error(`[verify] open session for ${user.id}: ${error.message}`);
    return { unavailable: true };
  }

  return {
    sessionId,
    region: process.env.AWS_REGION!,
    credentials: {
      ...credentials,
      expiration: credentials.expiration?.toISOString(),
    },
  };
}

/** Put one image in the private bucket and hand back its path. */
async function store(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
  bytes: Uint8Array,
  kind: string,
): Promise<string | null> {
  const path = `${userId}/${kind}-${crypto.randomUUID()}.jpg`;
  const { error } = await service.storage
    .from("verification-selfies")
    // A fresh uuid every time and no upsert, matching the storage policy: the
    // bucket has insert, admin-read and admin-delete, and nothing else.
    .upload(path, bytes, { contentType: "image/jpeg", upsert: false });

  if (error) {
    console.error(`[verify] store ${kind} for ${userId}: ${error.message}`);
    return null;
  }
  return path;
}

/**
 * Collect the result, before AWS throws it away.
 *
 * The session, the confidence and every image expire three minutes after the
 * session was created. So this reads them once and copies them into storage
 * immediately — a reviewer looking at this application tomorrow needs a
 * photograph, and "we had one for three minutes" is not a review process.
 *
 * **The verdict is never sent by the client.** It sends a session id; what that
 * session found is asked of AWS here. A confidence score in a form field would
 * make the whole thing theatre.
 *
 * Failing the check does not fail the application. The row records what
 * happened and the funnel continues — §7.3's reviewer is the backstop, and a
 * camera that will not focus is not grounds for turning somebody away.
 */
export async function finishLiveness(sessionId: string): Promise<LivenessFinish> {
  const user = await currentUser();
  if (!user) return { error: "Your session expired. Go back to the code step and verify again." };

  if (usingSeedData()) return { ok: true, selfiePath: `${user.id}/seed.jpg` };

  const service = createServiceClient();

  /*
   * Claimed by UPDATE rather than read-then-write, and only a row that is
   * unconsumed, unexpired, and this applicant's own. A session that could be
   * collected twice is one an attacker can attach to a second application.
   */
  const { data: claimed, error: claimError } = await service
    .from("verification_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("liveness_session_id", sessionId)
    .eq("user_id", user.id)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();

  if (claimError) {
    console.error(`[verify] claim ${sessionId}: ${claimError.message}`);
    return { error: "We couldn't finish the check. Try again in a moment." };
  }
  if (!claimed) return { error: "That check expired. Start it again." };

  const result = await livenessResult(sessionId);
  if (!result) {
    // No answer is not a failure. The row keeps `passed` null, which every
    // reader downstream is built to treat as "nobody checked".
    return { error: "We couldn't read the result. Start the check again." };
  }

  const reference = result.reference ? await store(service, user.id, result.reference, "ref") : null;
  const audit: string[] = [];
  for (const [index, bytes] of result.audit.entries()) {
    const path = await store(service, user.id, bytes, `audit-${index}`);
    if (path) audit.push(path);
  }

  if (!reference) {
    /*
     * AWS's own guidance: when the reference image is missing, retry. Without
     * it there is nothing to compare against the profile photos and nothing for
     * a reviewer to look at, so an application filed now would reach them as an
     * empty frame.
     */
    return { error: "That didn't produce a usable photo. Start the check again." };
  }

  /*
   * Measured from the bytes already in hand, before they are let go.
   *
   * Re-downloading these from storage to ask Rekognition about them would be
   * three more round trips for images sitting in memory right now, and the
   * applicant is watching a spinner for every one of them.
   */
  const capture = assessCapture(await frameQuality([result.reference!, ...result.audit]));

  const { error: writeError } = await service
    .from("verification_challenges")
    .update({
      confidence: result.confidence,
      // Judged in `decideVerification` at filing, against the same threshold
      // the reviewer's screen explains. Stored raw here so a changed threshold
      // re-reads history correctly rather than being baked into the row.
      frame_paths: [reference, ...audit],
      // Evidence and calibration, never a gate. Recorded on every attempt so
      // `SETTLED_SHARPNESS` can be re-read against real applicants instead of
      // the four captures it was set from.
      capture_sharpness: capture.sharpness,
      capture_brightness: capture.brightness,
    })
    .eq("id", claimed.id);

  if (writeError) {
    console.error(`[verify] write for ${user.id}: ${writeError.message}`);
    return { error: "We couldn't save the check. Try again in a moment." };
  }

  /*
   * `ok` is about the capture, not the verdict.
   *
   * Somebody whose liveness score came back low still continues, and is not
   * told — an applicant who learns the number learns what to aim at, and an
   * honest applicant told "you failed a liveness check" reads it as an
   * accusation. The reviewer sees everything; the applicant sees that their
   * photo was taken.
   */
  return { ok: true, selfiePath: reference, retake: capture.advice ?? undefined };
}
