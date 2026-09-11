import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";

/**
 * AWS credentials, shared by the two things that use them — geocoding a
 * postcode (Amazon Location Places) and reading a face (Rekognition).
 *
 * One module so there is one answer to "is AWS set up", and so a
 * half-configured account — a key with no region, a region with no key — is a
 * single loud failure rather than two confusing ones at opposite ends of the
 * funnel.
 *
 * Optional, like Stripe and Resend and the VAPID pair before it. A deployment
 * without credentials is a valid state: the location step falls back to the
 * browser's own geolocation, and verification stays entirely human. Neither
 * path 500s and neither pretends.
 *
 * ---------------------------------------------------------------------------
 * Two ways to be authorised, and the good one wins
 * ---------------------------------------------------------------------------
 *
 * **A role, via OIDC.** On Vercel, every function invocation carries a
 * short-lived token signed by Vercel's identity provider. AWS is configured to
 * trust that issuer, so the token is exchanged for credentials that expire in
 * an hour. Nothing persistent is stored anywhere: there is no secret in the
 * environment, nothing to leak from a build log, and nothing to rotate.
 *
 * **An access key.** A key and secret in the environment. They never expire and
 * work from anywhere on earth that has them, which is the whole problem.
 *
 * `AWS_ROLE_ARN` wins when both are present. That ordering is what makes the
 * migration safe rather than a flag day: add the role, confirm it works, then
 * delete the keys — and at no point is the app without a way to authenticate.
 */

/*
 * The regions that carry everything this app needs.
 *
 * Narrowed from fifteen to five by 0031. Amazon Location Places and the
 * Rekognition image APIs are nearly everywhere; **Face Liveness is in five
 * regions only**, and it is now the identity check rather than an extra. So the
 * intersection is the constraint, and a deployment in us-east-2 — fine for
 * everything else — would reach the liveness call and find no endpoint.
 *
 * Here because of a trap specific to this deployment. **Vercel presets
 * `AWS_REGION`** to the AWS region its own function runs in — a deployment in
 * `sfo1` arrives with `AWS_REGION=us-west-1` whether or not anybody set it.
 * Vercel's own documentation goes further: with multi-region routing the value
 * "can change depending on which region your function runs in". That value
 * grants nothing and, worse, `us-west-1` is not on this list: the SDK would
 * build an endpoint for a region where neither service exists and fail at call
 * time with something about hostnames.
 *
 * So a region that cannot serve us is treated as *not configured* and says so,
 * which is a legible message instead of a confusing one. The cost of being
 * wrong in the other direction — AWS adds a region and this list is stale — is
 * a line here; refresh it from the regional services table if that happens.
 */
const SUPPORTED_REGIONS = new Set([
  "us-east-1", "us-west-2", "eu-west-1", "ap-northeast-1", "ap-south-1",
]);

/*
 * Inferred from the provider rather than imported from `@smithy/types`. That
 * package is a transitive dependency of the SDK, and depending on it directly
 * to name one type is how a lockfile bump becomes a type error in a file that
 * did not change.
 */
type AwsCredentials =
  | ReturnType<typeof awsCredentialsProvider>
  | { accessKeyId: string; secretAccessKey: string };

export interface AwsConfig {
  region: string;
  credentials: AwsCredentials;
  /** Which of the two got used. Reported by `pnpm aws:check`; never a branch. */
  source: "oidc" | "access-key";
}

let cached: AwsConfig | null = null;
let checked = false;

export function awsConfig(): AwsConfig | null {
  if (checked) return cached;
  checked = true;

  const region = process.env.AWS_REGION;
  const roleArn = process.env.AWS_ROLE_ARN;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  const hasKeys = Boolean(accessKeyId && secretAccessKey);
  const hasSomething = Boolean(roleArn) || hasKeys;

  if (!region || !hasSomething) {
    // Loud only when it is half-done. Nothing set is the normal state of a
    // deployment that has not set AWS up, and is not worth a log line on
    // every boot.
    if (region || roleArn || accessKeyId || secretAccessKey) {
      console.error(
        "[aws] partially configured — need AWS_REGION plus either AWS_ROLE_ARN (OIDC) " +
          "or AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY together. " +
          "Treating AWS as unavailable.",
      );
    }
    cached = null;
    return cached;
  }

  if (!SUPPORTED_REGIONS.has(region)) {
    // Loud, and always: this is the shape a forgotten `AWS_REGION` takes on
    // Vercel, where the variable is never actually missing.
    console.error(
      `[aws] AWS_REGION is "${region}", which does not carry Rekognition Face Liveness and ` +
        "Amazon Location Places. On Vercel this variable is preset to the function's own region unless " +
        "you set it — set it explicitly (us-east-1 is the usual answer). Treating AWS as " +
        "unavailable rather than calling an endpoint that is not there.",
    );
    cached = null;
    return cached;
  }

  if (roleArn) {
    /*
     * The provider is a function, not a credential. It is called on the first
     * request that needs AWS and again when the hour is up, which is what lets
     * this module be evaluated once at import while the credentials stay
     * short-lived. Nothing here reads the OIDC token — on Vercel it arrives on
     * the request, and locally `vercel env pull` writes VERCEL_OIDC_TOKEN.
     */
    cached = { region, credentials: awsCredentialsProvider({ roleArn }), source: "oidc" };
    return cached;
  }

  cached = {
    region,
    credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    source: "access-key",
  };
  return cached;
}

export const awsConfigured = (): boolean => awsConfig() !== null;

/**
 * Temporary credentials for the browser, able to do exactly one thing.
 *
 * Face Liveness streams video from the device straight to Rekognition, so the
 * browser has to sign those requests itself. There is no version of this where
 * a long-lived access key is acceptable in a page — so this path requires the
 * OIDC role, and returns null without it. Verification then stays entirely
 * human, which is the same way every other missing credential degrades here.
 *
 * The session policy is the point. A session policy can only ever *narrow* what
 * the role may do, so what reaches the page can start a liveness stream and
 * nothing else: it cannot read a face, compare one, geocode, or see the results
 * of its own session. Fifteen minutes is the floor STS allows and far more than
 * a capture needs.
 */
export async function livenessBrowserCredentials(): Promise<{
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: Date;
} | null> {
  const config = awsConfig();
  const roleArn = process.env.AWS_ROLE_ARN;
  if (!config || config.source !== "oidc" || !roleArn) return null;

  try {
    const provider = awsCredentialsProvider({
      roleArn,
      durationSeconds: 900,
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: "rekognition:StartFaceLivenessSession",
            Resource: "*",
          },
        ],
      }),
    });
    const credentials = await provider();
    return {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      expiration: credentials.expiration,
    };
  } catch (cause) {
    console.error(`[aws] liveness credentials: ${cause instanceof Error ? cause.message : cause}`);
    return null;
  }
}
