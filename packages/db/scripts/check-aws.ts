/**
 * Does AWS actually work from here?
 *
 *   pnpm aws:check
 *
 * Answers the question the setup guide ends on, and answers it by *spending
 * money* — two real calls, a fraction of a cent, rather than checking that
 * three environment variables are non-empty. A key with the wrong permissions,
 * a region that carries neither service, a policy typo in the provider ARN:
 * all three look identical to a presence check and identical to each other in
 * a runtime stack trace.
 *
 * Reports what is wrong in the terms of the fix. AccessDenied means the policy;
 * an endpoint or credential error means the region or the key.
 */
import { DetectFacesCommand, RekognitionClient } from "@aws-sdk/client-rekognition";
import { GeoPlacesClient, GeocodeCommand } from "@aws-sdk/client-geo-places";
import { ENV_PATH, loadRepoEnv } from "./env";

loadRepoEnv();

const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", Y = "\x1b[33m", X = "\x1b[0m";
let failures = 0;

const ok = (label: string, detail = "") =>
  console.log(`  ${G}✓${X} ${label}${detail ? `  ${D}${detail}${X}` : ""}`);
const bad = (label: string, detail = "") => {
  failures += 1;
  console.log(`  ${R}✗${X} ${label}${detail ? `\n      ${D}${detail}${X}` : ""}`);
};

/*
 * The fifteen regions that carry both services. Kept in step with
 * `apps/web/src/lib/aws.ts` — the point of repeating it is that this script
 * runs *before* anybody trusts the app, so it cannot import from the app and
 * inherit a bug it is supposed to catch.
 */
const SUPPORTED = new Set([
  "ap-northeast-1", "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-southeast-5",
  "ca-central-1", "eu-central-1", "eu-south-2", "eu-west-1", "eu-west-2",
  "sa-east-1", "us-east-1", "us-east-2", "us-gov-west-1", "us-west-2",
]);

/** A 1×1 JPEG. Rekognition needs a decodable image, not a face. */
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
    "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

function explain(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  const name = cause instanceof Error ? cause.name : "";

  const both = `${name} ${message}`;

  /*
   * Order matters, and the first two are the pair that is easy to conflate.
   *
   * "The security token included in the request is invalid" is
   * UnrecognizedClientException: AWS has never heard of this access key id. It
   * is NOT a permissions problem, and sending somebody to the policy editor to
   * fix a mistyped key costs an hour. AccessDenied is the opposite — the key is
   * real, the action is not allowed.
   */
  if (/UnrecognizedClient|security token included in the request is invalid/i.test(both)) {
    return `${message}\n      → AWS_ACCESS_KEY_ID. This account has no such key — check for a typo, or a key that was deleted.`;
  }
  if (/InvalidSignature|SignatureDoesNotMatch/i.test(both)) {
    return `${message}\n      → AWS_SECRET_ACCESS_KEY is wrong, truncated, or has a stray character.`;
  }
  if (/AccessDenied|not authorized|is not authorized to perform/i.test(both)) {
    return `${message}\n      → the IAM policy. The key is real and AWS refused this action — check the policy is attached and names this action.`;
  }
  if (/getaddrinfo|ENOTFOUND|EAI_AGAIN|Inaccessible host|endpoint/i.test(message)) {
    return `${message}\n      → AWS_REGION. That endpoint does not exist.`;
  }
  return message;
}

async function main() {
  console.log("\nAWS — two real calls, not three non-empty variables.\n");

  const region = process.env.AWS_REGION;
  const keyId = process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !keyId || !secret) {
    const missing = [
      !region && "AWS_REGION",
      !keyId && "AWS_ACCESS_KEY_ID",
      !secret && "AWS_SECRET_ACCESS_KEY",
    ].filter(Boolean);
    console.log(`  ${Y}–${X} not set: ${missing.join(", ")}`);
    console.log(`\n  ${D}Add them to ${ENV_PATH}. Both features degrade without them:${X}`);
    console.log(`  ${D}the postcode lookup says so and the location button still works;${X}`);
    console.log(`  ${D}every applicant records liveness_passed = NULL and a person reviews them.${X}\n`);
    process.exit(1);
  }

  if (!SUPPORTED.has(region)) {
    bad(
      `AWS_REGION is "${region}", which carries neither service`,
      "On Vercel this variable is preset to the function's own region unless you set it,\n" +
        "      so forgetting it looks like setting it. us-east-1 is the usual answer.",
    );
    console.log(`\n${R}Stopping — every call below would fail for this one reason.${X}\n`);
    process.exit(1);
  }
  ok("AWS_REGION carries both services", region);
  ok("credentials present", `${keyId.slice(0, 8)}… / secret ${secret.length} chars`);

  console.log("\nRekognition");
  try {
    const out = await new RekognitionClient({
      region,
      credentials: { accessKeyId: keyId, secretAccessKey: secret },
    }).send(new DetectFacesCommand({ Image: { Bytes: TINY_JPEG }, Attributes: ["ALL"] }));
    // Zero faces in a 1×1 image is the right answer. What is being proved is
    // that the call was allowed and the image decoded — a face would only add
    // a way for this to fail that has nothing to do with setup.
    ok("DetectFaces is allowed", `${out.FaceDetails?.length ?? 0} faces in a 1×1 test image`);
  } catch (cause) {
    bad("DetectFaces failed", explain(cause));
  }

  try {
    const out = await new RekognitionClient({
      region,
      credentials: { accessKeyId: keyId, secretAccessKey: secret },
    }).send(
      // CompareFaces is a separate IAM action and a separate pricing group, so
      // DetectFaces passing says nothing about it. An image with no face gives
      // InvalidParameterException — which is the service answering, and that is
      // the thing being tested.
      new (await import("@aws-sdk/client-rekognition")).CompareFacesCommand({
        SourceImage: { Bytes: TINY_JPEG },
        TargetImage: { Bytes: TINY_JPEG },
        SimilarityThreshold: 0,
      }),
    );
    ok("CompareFaces is allowed", `${out.FaceMatches?.length ?? 0} matches`);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (/InvalidParameter|no faces|NoFace/i.test(message)) {
      ok("CompareFaces is allowed", "service rejected the faceless test image, which is the point");
    } else {
      bad("CompareFaces failed", explain(cause));
    }
  }

  console.log("\nAmazon Location Places");
  try {
    const out = await new GeoPlacesClient({
      region,
      credentials: { accessKeyId: keyId, secretAccessKey: secret },
    }).send(
      new GeocodeCommand({
        QueryText: "30308",
        // The same value the app sends. `SingleUse` would pass here and fail
        // the terms of service in production, so the check has to use the real
        // one — a different bucket is a different price and a different answer.
        IntendedUse: "Storage",
        MaxResults: 1,
      }),
    );
    const item = out.ResultItems?.[0];
    const position = item?.Position;
    if (!position) {
      bad("Geocode returned nothing for 30308", "credentials work; the query found no place.");
    } else {
      // [lng, lat]. Printed in the order the API returns them and labelled,
      // because reading them the other way round is the bug this catches.
      ok(
        "Geocode is allowed, with IntendedUse: Storage",
        `30308 → ${item?.Title} (lng ${position[0]}, lat ${position[1]})`,
      );
    }
  } catch (cause) {
    bad("Geocode failed", explain(cause));
  }

  if (failures > 0) {
    console.log(`\n${R}${failures} call(s) failed${X} — see the arrow under each.\n`);
    process.exit(1);
  }
  console.log(`\n${G}AWS is wired up.${X} ${D}Geocoding and face verification will both run.${X}\n`);
}

main().catch((error) => {
  console.error(`\n${R}${error instanceof Error ? error.message : String(error)}${X}\n`);
  process.exit(1);
});
