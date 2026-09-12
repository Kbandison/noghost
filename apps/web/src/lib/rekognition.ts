import {
  CompareFacesCommand,
  CreateFaceLivenessSessionCommand,
  DetectFacesCommand,
  DetectModerationLabelsCommand,
  GetFaceLivenessSessionResultsCommand,
  RekognitionClient,
} from "@aws-sdk/client-rekognition";
import { MODERATION_FLOOR, type FrameQuality, type PhotoReading } from "@noghost/logic";
import { awsConfig } from "./aws";

/**
 * Rekognition's hard cap on inline image bytes: 5MiB, for every image API.
 *
 * Not a number we chose and not one we can raise — the S3 form of these calls
 * allows 15MB, but the frames live in a Supabase bucket AWS cannot reach.
 */
export const REKOGNITION_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Reading a face — the only part of verification that leaves this building.
 *
 * Two calls, both on raw bytes rather than an S3 reference, because the frames
 * live in a Supabase bucket that AWS cannot reach. Each is a fraction of a cent
 * and runs at most a handful of times per applicant.
 *
 * Every function here returns `null` when AWS is not configured or the call
 * fails, and `null` means "no answer", never "no". `decideVerification` is
 * built around that distinction: a missing answer sends the application to a
 * person, which is where it would have gone anyway. An outage must not become
 * a wave of rejections, and there is no path in this file that can produce one.
 */

let client: RekognitionClient | null = null;

function rekognition(): RekognitionClient | null {
  const config = awsConfig();
  if (!config) return null;
  client ??= new RekognitionClient(config);
  return client;
}

export const faceChecksConfigured = (): boolean => rekognition() !== null;


/**
 * Open a Face Liveness session.
 *
 * The id it returns is handed to the browser, which streams video straight to
 * Rekognition — the video never touches our servers, which is both faster and
 * one less place for a recording of somebody's face to sit.
 *
 * **Three minutes.** AWS expires the session, and the reference and audit
 * images with it, three minutes after this call. That is why `livenessResult`
 * copies the images into storage the moment they come back rather than keeping
 * a session id and fetching them later.
 */
export async function createLivenessSession(): Promise<string | null> {
  const aws = rekognition();
  if (!aws) return null;

  try {
    const response = await aws.send(
      new CreateFaceLivenessSessionCommand({
        Settings: {
          // The reviewer's evidence. Four is the maximum, and this is the
          // screen where a person decides whether somebody is real — there is
          // no version of this where fewer images is the better trade.
          AuditImagesLimit: 4,
        },
      }),
    );
    return response.SessionId ?? null;
  } catch (cause) {
    console.error(`[rekognition] create session: ${cause instanceof Error ? cause.message : cause}`);
    return null;
  }
}

export interface LivenessResult {
  /** 0–100. How sure Rekognition is that a live person was in front of it. */
  confidence: number;
  /** The best frame, for comparing against their photos. */
  reference: Uint8Array | null;
  /** Up to four more, for the reviewer to look at. */
  audit: Uint8Array[];
}

/**
 * Collect the verdict, and everything we will ever be able to see of it.
 *
 * Returns null for "no answer" — not configured, not finished, an outage. As
 * everywhere else here, that routes the application to a person rather than
 * failing it.
 */
export async function livenessResult(sessionId: string): Promise<LivenessResult | null> {
  const aws = rekognition();
  if (!aws) return null;

  try {
    const response = await aws.send(
      new GetFaceLivenessSessionResultsCommand({ SessionId: sessionId }),
    );

    /*
     * Only SUCCEEDED carries a real confidence. CREATED and IN_PROGRESS mean
     * the video never arrived; FAILED and EXPIRED mean it did and Rekognition
     * could not use it. Reading a zero out of any of those as "this person
     * failed" is the mistake this check exists to prevent — none of them is
     * evidence about the applicant.
     */
    if (response.Status !== "SUCCEEDED") {
      console.error(`[rekognition] session ${sessionId} ended ${response.Status}`);
      return null;
    }

    return {
      confidence: response.Confidence ?? 0,
      reference: response.ReferenceImage?.Bytes ?? null,
      audit: (response.AuditImages ?? [])
        .map((image) => image.Bytes)
        .filter((bytes): bytes is Uint8Array => Boolean(bytes)),
    };
  } catch (cause) {
    console.error(`[rekognition] results: ${cause instanceof Error ? cause.message : cause}`);
    return null;
  }
}

/**
 * How alike the live face and the profile photo are, 0–100.
 *
 * `SimilarityThreshold: 0` on purpose. The default is 80 and silently returns
 * an empty match list below it, which would arrive here as `null` — "we could
 * not check" — for exactly the near-miss cases a reviewer most needs the number
 * for. Asking for every score and applying the product's own threshold in
 * `decideVerification` keeps the policy in one readable place.
 */
export async function compareFaces(
  live: Uint8Array,
  photo: Uint8Array,
): Promise<number | null> {
  const aws = rekognition();
  if (!aws) return null;

  try {
    const response = await aws.send(
      new CompareFacesCommand({
        SourceImage: { Bytes: live },
        TargetImage: { Bytes: photo },
        SimilarityThreshold: 0,
      }),
    );
    const best = (response.FaceMatches ?? [])
      .map((match) => match.Similarity ?? 0)
      .sort((a, b) => b - a)[0];

    // No match entry at all means Rekognition found a face in the photo and it
    // resembles the live one not at all — a real answer of zero, not a missing
    // one. An unreadable target image throws instead, and lands above.
    if (best === undefined) return (response.UnmatchedFaces ?? []).length > 0 ? 0 : null;
    return best;
  } catch (cause) {
    console.error(`[rekognition] compare: ${cause instanceof Error ? cause.message : cause}`);
    return null;
  }
}

/**
 * How well the camera was doing while it filmed.
 *
 * One `DetectFaces` per frame, run in parallel, reading only `Quality` — the
 * same call `readPhoto` already makes, asked a different question. Sharpness
 * and brightness both come back 0-100.
 *
 * This exists because a genuine applicant scored 0.0001 with a face Rekognition
 * separately matched to their profile photo at 99.99. Sharpness is what
 * separated that capture from their three that scored; brightness is recorded
 * alongside it and deliberately decides nothing, because across those same four
 * captures it ordered randomly against the score.
 *
 * A frame with no face in it yields nulls rather than zeros. Zero is a
 * measurement and this is the absence of one — `assessCapture` needs to tell
 * "perfectly black" from "we could not look", and only one of those is a reason
 * to ask somebody to film themselves again.
 */
export async function frameQuality(images: Uint8Array[]): Promise<FrameQuality[]> {
  const aws = rekognition();
  if (!aws) return [];

  return Promise.all(
    images.map(async (bytes) => {
      try {
        const out = await aws.send(
          new DetectFacesCommand({ Image: { Bytes: bytes }, Attributes: ["DEFAULT"] }),
        );
        // The largest face is the subject, matching `readPhoto`. Somebody
        // walking through the background must not decide the verdict.
        const face = [...(out.FaceDetails ?? [])].sort(
          (a, b) => (b.BoundingBox?.Width ?? 0) - (a.BoundingBox?.Width ?? 0),
        )[0];
        return {
          sharpness: face?.Quality?.Sharpness ?? null,
          brightness: face?.Quality?.Brightness ?? null,
        };
      } catch (cause) {
        // Logged, not thrown. This is advisory: the worst outcome of failing
        // here is that somebody is not offered a retake they might have wanted,
        // which is where they were before any of this existed.
        console.error(`[rekognition] frame quality: ${cause instanceof Error ? cause.message : cause}`);
        return { sharpness: null, brightness: null };
      }
    }),
  );
}

/**
 * Everything the photo policy needs to judge one image.
 *
 * Two calls, because Rekognition answers two different questions and neither
 * alone is enough. `DetectModerationLabels` says what is *in* the picture —
 * and, in `ContentTypes`, what kind of picture it is, which is how a cartoon
 * gets caught. `DetectFaces` says whether there is a person in it, how many,
 * and how much of the frame they occupy.
 *
 * Returns null on any failure, and null means "nobody checked" — `decidePhoto`
 * routes that to a human rather than treating it as clean. An outage must never
 * become a wave of auto-approved photographs.
 */
export async function readPhoto(bytes: Uint8Array): Promise<PhotoReading | null> {
  const aws = rekognition();
  if (!aws) return null;

  /*
   * Rekognition refuses raw bytes over 5MB, and it refuses them as a 400 that
   * looks like any other AWS failure once it reaches the catch below.
   *
   * Found by running the real policy over real uploads: two 4000px originals at
   * 6.4MB and 6.8MB came back `ValidationException: Member must have length
   * less than or equal to 5242880`, which became `null`, which became
   * "needs-a-person". Not dangerous — that is the safe direction — but silent,
   * and it means a photo can be perfectly clean and still never auto-admit,
   * with nothing in the logs naming the size as the reason.
   *
   * `prepareImage` now caps uploads at 2000px/q0.85, which lands around 300-500KB,
   * so this should not fire for anything uploaded through the funnel today. It
   * fires for photos that predate that, and it says so rather than spending a
   * round trip to be told off.
   */
  if (bytes.byteLength > REKOGNITION_MAX_BYTES) {
    console.error(
      `[rekognition] photo is ${(bytes.byteLength / 1_048_576).toFixed(1)}MB, over ` +
        `Rekognition's ${(REKOGNITION_MAX_BYTES / 1_048_576).toFixed(0)}MB limit — not screened, ` +
        `so it goes to a person. Re-upload it to get it re-encoded.`,
    );
    return null;
  }

  try {
    const [moderation, faces] = await Promise.all([
      aws.send(
        new DetectModerationLabelsCommand({
          Image: { Bytes: bytes },
          // Rekognition's own default is 50. Asking a little lower than the
          // policy's floor means the policy decides what to act on, rather
          // than inheriting a cutoff from the service.
          MinConfidence: Math.min(50, MODERATION_FLOOR),
        }),
      ),
      aws.send(new DetectFacesCommand({ Image: { Bytes: bytes }, Attributes: ["DEFAULT"] })),
    ]);

    const detected = faces.FaceDetails ?? [];
    // The largest face is the subject. A friend in the background should not
    // decide whether this photograph is usable.
    const largest = [...detected].sort(
      (a, b) => (b.BoundingBox?.Width ?? 0) - (a.BoundingBox?.Width ?? 0),
    )[0];

    return {
      flags: (moderation.ModerationLabels ?? []).map((label) => ({
        name: label.Name ?? "",
        parent: label.ParentName || null,
        confidence: label.Confidence ?? 0,
      })),
      contentTypes: (moderation.ContentTypes ?? []).map((type) => ({
        name: type.Name ?? "",
        confidence: type.Confidence ?? 0,
      })),
      faceCount: detected.length,
      faceShare: largest?.BoundingBox?.Width ?? 0,
      faceConfidence: largest?.Confidence ?? 0,
    };
  } catch (cause) {
    console.error(`[rekognition] photo: ${cause instanceof Error ? cause.message : cause}`);
    return null;
  }
}
