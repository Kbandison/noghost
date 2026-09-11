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
