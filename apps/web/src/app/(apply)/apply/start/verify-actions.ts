"use server";

import { createServiceClient } from "@noghost/db/service";
import { usingSeedData } from "@noghost/config/env";
import {
  CHALLENGE_LENGTH,
  buildChallenge,
  challengePassed,
  type ChallengePose,
  type FaceReading,
} from "@noghost/logic";
import { allowRequest } from "@/lib/rate-limit";
import { readFace, faceChecksConfigured } from "@/lib/rekognition";
import { supabaseServer } from "@/lib/supabase";

/**
 * The two halves of the pose challenge — issuing it, and judging the answer.
 *
 * Both run on the server with the service key, and neither is reachable as an
 * RPC from an applicant's own session. That is the point: `verification_challenges`
 * has RLS on and no policies, so a member cannot read the sequence they are
 * about to be asked for, and cannot write the verdict on their own row.
 * Everything an applicant can do here is send frames and be told yes or no.
 */

/** Long enough to read three instructions and do them; short enough to matter. */
const CHALLENGE_TTL_SECONDS = 180;

export interface ChallengeState {
  id?: string;
  poses?: ChallengePose[];
  error?: string;
}

export interface CaptureState {
  ok?: boolean;
  /** Paths of the frames that were accepted, centered frame first. */
  framePaths?: string[];
  error?: string;
}

async function currentUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Hand out a sequence.
 *
 * Rate-limited per applicant rather than per address, because the attack is one
 * account asking repeatedly until it draws a sequence it already has frames
 * for. Six in ten minutes is more retries than an honest person needs after a
 * camera mishap, and far fewer than fishing requires.
 */
export async function issueChallenge(): Promise<ChallengeState> {
  const user = await currentUser();
  if (!user) return { error: "Your session expired. Go back to the code step and verify again." };

  if (usingSeedData()) {
    // Seed mode keeps the funnel walkable with nothing provisioned. A real
    // sequence, no row behind it — `submitCapture` short-circuits to match.
    return { id: "seed", poses: buildChallenge(Math.random) };
  }

  if (!(await allowRequest("verify-challenge", { limit: 6, windowSeconds: 600 }, user.id))) {
    return { error: "That's a lot of attempts. Wait a few minutes and try again." };
  }

  const poses = buildChallenge(Math.random);
  const service = createServiceClient();
  const { data, error } = await service
    .from("verification_challenges")
    .insert({
      user_id: user.id,
      poses,
      expires_at: new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error(`[verify] issue for ${user.id}: ${error?.message}`);
    return { error: "We couldn't start the check. Try again in a moment." };
  }

  return { id: data.id, poses };
}

/** Pull a frame back out of the private bucket so AWS can be shown the bytes. */
async function frameBytes(
  service: ReturnType<typeof createServiceClient>,
  path: string,
): Promise<Uint8Array | null> {
  const { data, error } = await service.storage.from("verification-selfies").download(path);
  if (error || !data) {
    console.error(`[verify] download ${path}: ${error?.message}`);
    return null;
  }
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Judge the answer.
 *
 * The frames were uploaded by the browser straight to `verification-selfies`,
 * which is folder-scoped to the applicant's own id and has no read policy for
 * anybody but an admin. This reads them back with the service key, shows each
 * one to Rekognition, and writes the verdict.
 *
 * **The verdict is never sent by the client.** The client sends paths; what
 * those frames contain is decided here. A `passed: true` in a form field would
 * make the whole sequence theatre.
 *
 * Failing the sequence does not fail the application. The row records what
 * happened and the funnel continues — §7.3's reviewer is the backstop, and a
 * camera that will not focus is not grounds for turning somebody away.
 */
export async function submitCapture(
  _prev: CaptureState,
  formData: FormData,
): Promise<CaptureState> {
  const user = await currentUser();
  if (!user) return { error: "Your session expired. Go back to the code step and verify again." };

  const challengeId = String(formData.get("challengeId") ?? "");
  const paths = formData.getAll("framePaths").map((p) => String(p));

  if (paths.length !== CHALLENGE_LENGTH) {
    return { error: "Some frames didn't upload. Start the check again." };
  }

  if (usingSeedData()) return { ok: true, framePaths: paths };

  const service = createServiceClient();

  /*
   * Claimed before it is judged, and claimed by UPDATE rather than by reading
   * then writing. A sequence that could be answered twice is a sequence an
   * attacker gets unlimited attempts at with the poses already in hand — the
   * row's own `consumed_at is null` is what makes the claim atomic under two
   * simultaneous submissions.
   */
  const { data: claimed, error: claimError } = await service
    .from("verification_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", challengeId)
    .eq("user_id", user.id)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("poses")
    .maybeSingle();

  if (claimError) {
    console.error(`[verify] claim ${challengeId}: ${claimError.message}`);
    return { error: "We couldn't run the check. Try again in a moment." };
  }
  if (!claimed) {
    return { error: "That check expired. Start it again." };
  }

  const poses = claimed.poses as ChallengePose[];

  /*
   * Read the frames whatever happens, because `selfie_path` and `frame_paths`
   * have to be stored even when no automated check can run — a reviewer with no
   * photograph to look at has nothing to review.
   */
  let outcome: boolean | null = null;

  if (faceChecksConfigured()) {
    const readings: (FaceReading | null)[] = [];
    for (const path of paths) {
      const bytes = await frameBytes(service, path);
      readings.push(bytes ? await readFace(bytes) : null);
    }

    // `readFace` returns null for an AWS failure and a zero-face reading for a
    // frame with nobody in it. Only the first is "we could not check".
    outcome = readings.some((r) => r === null) ? null : challengePassed(poses, readings);
  }

  /*
   * Written to the challenge row, not to `verifications`.
   *
   * `verifications.user_id` references `profiles.id`, and there is no profile
   * row yet — the name, birthdate and gender it requires are collected on the
   * step after this one. Moving the selfie forward is what created that gap;
   * this is where the result waits until `fileApplication` has somewhere to
   * put it. The row is server-only (RLS on, no policies), so it is no less
   * protected here.
   */
  const { error: writeError } = await service
    .from("verification_challenges")
    .update({ passed: outcome, frame_paths: paths })
    .eq("id", challengeId)
    .eq("user_id", user.id);

  if (writeError) {
    console.error(`[verify] write for ${user.id}: ${writeError.message}`);
    return { error: "We couldn't save the check. Try again in a moment." };
  }

  /*
   * `ok` is about the capture, not the verdict.
   *
   * Somebody who failed the sequence still continues, and is not told they
   * failed — an applicant who learns which frame was rejected learns how to
   * aim the next attempt, and an honest applicant told "you failed a liveness
   * check" reads it as an accusation. The reviewer sees everything; the
   * applicant sees that their photo was taken.
   */
  return { ok: true, framePaths: paths };
}
