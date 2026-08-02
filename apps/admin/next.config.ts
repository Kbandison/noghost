import type { NextConfig } from "next";

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
