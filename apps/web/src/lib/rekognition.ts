import {
  CompareFacesCommand,
  DetectFacesCommand,
  RekognitionClient,
  type FaceDetail,
} from "@aws-sdk/client-rekognition";
import type { FaceReading } from "@noghost/logic";
import { awsConfig } from "./aws";

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

/** Rekognition reports a value and a confidence; a value alone is a guess. */
function confident(attribute: { Value?: boolean; Confidence?: number } | undefined): boolean {
  return Boolean(attribute?.Value) && (attribute?.Confidence ?? 0) >= 90;
}

function toReading(faces: FaceDetail[]): FaceReading | null {
  // The largest face is the subject; anything else in frame is a bystander or
  // a held-up photograph. `faceCount` carries that to the policy, which
  // refuses the frame rather than picking a winner.
  const face = [...faces].sort(
    (a, b) => (b.BoundingBox?.Width ?? 0) - (a.BoundingBox?.Width ?? 0),
  )[0];
  if (!face) return { faceCount: 0, yaw: 0, pitch: 0, eyesOpen: false, smiling: false, confidence: 0 };

  return {
    faceCount: faces.length,
    yaw: face.Pose?.Yaw ?? 0,
    pitch: face.Pose?.Pitch ?? 0,
    eyesOpen: confident(face.EyesOpen),
    smiling: confident(face.Smile),
    confidence: face.Confidence ?? 0,
  };
}

export async function readFace(bytes: Uint8Array): Promise<FaceReading | null> {
  const aws = rekognition();
  if (!aws) return null;

  try {
    const response = await aws.send(
      // ALL, because the default returns a bounding box and nothing else —
      // no pose, no eyes, no smile, which is the entire answer being asked for.
      new DetectFacesCommand({ Image: { Bytes: bytes }, Attributes: ["ALL"] }),
    );
    return toReading(response.FaceDetails ?? []);
  } catch (cause) {
    console.error(`[rekognition] detect: ${cause instanceof Error ? cause.message : cause}`);
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
