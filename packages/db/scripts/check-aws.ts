/**
 * Does AWS actually work from here?
 *
 *   pnpm aws:check
 *
 * Answers the question the setup guide ends on, and answers it by *spending
 * money* — three real calls, a fraction of a cent, rather than checking that
 * three environment variables are non-empty. A key with the wrong permissions,
 * a region that carries neither service, a policy typo in the provider ARN:
 * all three look identical to a presence check and identical to each other in
 * a runtime stack trace.
 *
 * Reports what is wrong in the terms of the fix. AccessDenied means the policy;
 * an endpoint or credential error means the region or the key.
 */
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
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
  /*
   * The OIDC failures, first, because they are the ones that come back looking
   * like nothing at all. A token Vercel issued an hour ago is the single most
   * likely thing to be wrong locally, and STS reports it as a parse error or a
   * bare InvalidIdentityToken rather than "your token expired".
   */
  if (/InvalidIdentityToken|IDPRejectedClaim|ExpiredToken|not authorized to perform: sts:AssumeRoleWithWebIdentity/i.test(both)) {
    return `${message}\n      → the OIDC token or the role's trust policy. Re-run \`vercel env pull\` for a fresh token; if that does not fix it, the trust policy's sub/aud conditions do not match this project and environment.`;
  }
  if (/is not valid JSON|Unexpected token/i.test(message) && process.env.AWS_ROLE_ARN) {
    return `${message}\n      → VERCEL_OIDC_TOKEN is not a token STS could read. Re-run \`vercel env pull\`.`;
  }
  if (/UnrecognizedClient|security token included in the request is invalid/i.test(both)) {
    return `${message}\n      → AWS_ACCESS_KEY_ID. This account has no such key — check for a typo, or a key that was deleted.`;
  }
  if (/InvalidSignature|SignatureDoesNotMatch/i.test(both)) {
    return `${message}\n      → AWS_SECRET_ACCESS_KEY is wrong, truncated, or has a stray character.`;
  }
  if (/AccessDenied|not authorized|is not authorized to perform/i.test(both)) {
    return `${message}\n      → the IAM policy. The key is real and AWS refused this action — check the policy is attached and names this action.`;
  }
  if (/getaddrinfo|ENOTFOUND|EAI_AGAIN|Inaccessible host|UnknownEndpoint|endpoint/i.test(both)) {
    return `${message}\n      → AWS_REGION. That endpoint does not exist.`;
  }
  return message;
}

async function main() {
  console.log("\nAWS — three real calls, not three non-empty variables.\n");

  const region = process.env.AWS_REGION;
  const roleArn = process.env.AWS_ROLE_ARN;
  const keyId = process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env.AWS_SECRET_ACCESS_KEY;
  const hasKeys = Boolean(keyId && secret);

  if (!region || !(roleArn || hasKeys)) {
    console.log(`  ${Y}–${X} AWS is not set up here.`);
    console.log(`\n  ${D}Needs AWS_REGION, plus EITHER AWS_ROLE_ARN (OIDC, no stored secret)${X}`);
    console.log(`  ${D}OR AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY. In ${ENV_PATH}.${X}`);
    console.log(`\n  ${D}Both features degrade without them: the postcode lookup says so and${X}`);
    console.log(`  ${D}the location button still works; every applicant records${X}`);
    console.log(`  ${D}liveness_passed = NULL and a person reviews them.${X}\n`);
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

  /*
   * The same precedence `apps/web/src/lib/aws.ts` uses — role first, keys as
   * the fallback. A check that tested the keys while production assumed a role
   * would be green for the wrong reason, which is worse than no check.
   */
  let credentials:
    | ReturnType<typeof awsCredentialsProvider>
    | { accessKeyId: string; secretAccessKey: string };

  if (roleArn) {
    if (!process.env.VERCEL_OIDC_TOKEN) {
      bad(
        "AWS_ROLE_ARN is set but there is no OIDC token here",
        "OIDC tokens come from Vercel. Locally: `vercel link` then `vercel env pull`\n" +
          "      — and pull to the REPO ROOT .env.local, not into apps/web.\n" +
          "      The token is short-lived; re-pull when this reappears.",
      );
      console.log(`\n${R}Stopping — nothing below could authenticate.${X}\n`);
      process.exit(1);
    }
    credentials = awsCredentialsProvider({ roleArn });
    ok("assuming a role over OIDC", `${roleArn.split("/").pop()} — nothing persistent stored`);
    if (hasKeys) {
      console.log(
        `  ${Y}!${X} AWS_ACCESS_KEY_ID is also set and is being ignored.` +
          `\n      ${D}Once this run is green, delete the key in IAM and drop both variables.${X}`,
      );
    }
  } else {
    credentials = { accessKeyId: keyId!, secretAccessKey: secret! };
    ok("using a long-lived access key", `${keyId!.slice(0, 8)}… / secret ${secret!.length} chars`);
    console.log(
      `  ${Y}!${X} ${D}This credential never expires and works from anywhere.` +
        ` See docs/aws-setup.md for the role.${X}`,
    );
  }

  console.log("\nRekognition");
  try {
    const out = await new RekognitionClient({ region, credentials }).send(
      new DetectFacesCommand({ Image: { Bytes: TINY_JPEG }, Attributes: ["ALL"] }),
    );
    // Zero faces in a 1×1 image is the right answer. What is being proved is
    // that the call was allowed and the image decoded — a face would only add
    // a way for this to fail that has nothing to do with setup.
    ok("DetectFaces is allowed", `${out.FaceDetails?.length ?? 0} faces in a 1×1 test image`);
  } catch (cause) {
    bad("DetectFaces failed", explain(cause));
  }

  try {
    const out = await new RekognitionClient({ region, credentials }).send(
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
    /*
     * Matched against the error's NAME as well as its message, and that is not
     * belt-and-braces — it is the whole thing working.
     *
     * The AWS SDK puts the error code on `name` (`InvalidParameterException`)
     * and prose on `message` ("Request has invalid parameters"). Testing the
     * message alone therefore never matches, and this check reported a loud
     * red failure for the exact response it was written to treat as a pass —
     * sending somebody off to debug image formats when their credentials had
     * just been proven to work.
     */
    const name = cause instanceof Error ? cause.name : "";
    const message = cause instanceof Error ? cause.message : String(cause);
    if (/InvalidParameter|no faces|NoFace/i.test(`${name} ${message}`)) {
      ok(
        "CompareFaces is allowed",
        "refused the faceless 1×1 test image — which means the call itself got through",
      );
    } else {
      bad("CompareFaces failed", explain(cause));
    }
  }

  console.log("\nAmazon Location Places");
  try {
    const out = await new GeoPlacesClient({ region, credentials }).send(
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
      /*
       * Rounded, and labelled by axis.
       *
       * [lng, lat] is the order Amazon returns, and reading it the other way
       * round is the bug this line exists to catch. The rounding is shown
       * because the raw answer carries five decimals the product never stores —
       * printing those here would advertise a precision that does not survive
       * the trip, and this output is the first thing anybody sees.
       *
       * `Title` is deliberately not shown: for a postcode it names a building.
       * See `placeLabel`, which is why members never see it either.
       */
      const lat = Math.round(position[1]! * 1000) / 1000;
      const lng = Math.round(position[0]! * 1000) / 1000;
      ok(
        "Geocode is allowed, with IntendedUse: Storage",
        `30308 → ${item?.Address?.Locality ?? "?"}, ${item?.Address?.Region?.Code ?? "?"} ` +
          `(lat ${lat}, lng ${lng} — rounded, as stored)`,
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
