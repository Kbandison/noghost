import type { NextConfig } from "next";
import { loadRootEnv } from "../../env.config";

/*
 * Before anything else. The monorepo keeps one `.env.local` at its root rather
 * than a copy per app, and Next only ever looks in the app directory — so this
 * is what puts those values in `process.env` in time for `NEXT_PUBLIC_*` to be
 * inlined into the client bundle.
 */
loadRootEnv();

const nextConfig: NextConfig = {
  transpilePackages: [
    "@noghost/config",
    "@noghost/db",
    "@noghost/logic",
    "@noghost/types",
    "@noghost/ui-tokens",
  ],

  images: {
    // Applicant photos come from the public `photos` bucket. Verification
    // selfies do NOT appear here — they live in a private bucket and are read
    // through short-lived signed URLs, which have a query string and so are
    // deliberately outside this pattern.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
    qualities: [75],
  },

  typedRoutes: true,
};

export default nextConfig;
