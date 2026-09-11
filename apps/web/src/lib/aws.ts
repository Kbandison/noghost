/**
 * AWS credentials, shared by the two things that use them — geocoding a
 * postcode (Amazon Location) and comparing a face to a profile photo
 * (Rekognition).
 *
 * One module so there is one answer to "is AWS set up", and so a half-configured
 * account — a key with no region, a region with no key — is a single loud
 * failure rather than two confusing ones at opposite ends of the funnel.
 *
 * Optional, like Stripe and Resend and the VAPID pair before it. A deployment
 * without credentials is a valid state: the location step falls back to the
 * browser's own geolocation, and verification stays entirely human. Neither
 * path 500s and neither pretends.
 */

/**
 * The regions that carry BOTH Amazon Location Places and Rekognition.
 *
 * Here because of a trap specific to this deployment. **Vercel presets
 * `AWS_REGION`** to the AWS region its own function runs in — a deployment in
 * `sfo1` arrives with `AWS_REGION=us-west-1` whether or not anybody set it.
 * That value grants nothing and, worse, `us-west-1` is not on this list: the
 * SDK would build an endpoint for a region where neither service exists and
 * fail at call time with something about hostnames.
 *
 * So a region that cannot serve us is treated as *not configured* and says so,
 * which is a legible message instead of a confusing one. The cost of being
 * wrong in the other direction — AWS adds a region and this list is stale — is
 * a line here; refresh it from the regional services table if that happens.
 */
const SUPPORTED_REGIONS = new Set([
  "ap-northeast-1", "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-southeast-5",
  "ca-central-1", "eu-central-1", "eu-south-2", "eu-west-1", "eu-west-2",
  "sa-east-1", "us-east-1", "us-east-2", "us-gov-west-1", "us-west-2",
]);

export interface AwsConfig {
  region: string;
  credentials: { accessKeyId: string; secretAccessKey: string };
}

let cached: AwsConfig | null = null;
let checked = false;

export function awsConfig(): AwsConfig | null {
  if (checked) return cached;
  checked = true;

  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (region && accessKeyId && secretAccessKey && !SUPPORTED_REGIONS.has(region)) {
    // Loud, and always: this is the shape a forgotten `AWS_REGION` takes on
    // Vercel, where the variable is never actually missing.
    console.error(
      `[aws] AWS_REGION is "${region}", which does not carry Amazon Location Places and ` +
        "Rekognition. On Vercel this variable is preset to the function's own region unless " +
        "you set it — set it explicitly (us-east-1 is the usual answer). Treating AWS as " +
        "unavailable rather than calling an endpoint that is not there.",
    );
    cached = null;
    return cached;
  }

  if (!region || !accessKeyId || !secretAccessKey) {
    // Loud only when it is half-done. All three missing is the normal state of
    // a deployment that has not set AWS up, and is not worth a log line on
    // every boot.
    if (region || accessKeyId || secretAccessKey) {
      console.error(
        "[aws] partially configured — need AWS_REGION, AWS_ACCESS_KEY_ID and " +
          "AWS_SECRET_ACCESS_KEY together. Treating AWS as unavailable.",
      );
    }
    cached = null;
    return cached;
  }

  cached = { region, credentials: { accessKeyId, secretAccessKey } };
  return cached;
}

export const awsConfigured = (): boolean => awsConfig() !== null;
