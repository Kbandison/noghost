import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship raw TypeScript from `src/`, so Next compiles them
  // alongside the app rather than expecting a build step.
  transpilePackages: [
    "@noghost/config",
    "@noghost/db",
    "@noghost/logic",
    "@noghost/types",
    "@noghost/ui-tokens",
  ],

  images: {
    // Member photos come from Supabase Storage. Routing them through
    // next/image is what keeps a viral moment on Vercel's CDN instead of
    // Supabase's egress meter (BACKEND.md layer 2).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
    // Next 16 already defaults to [75]; stated so a future edit is deliberate —
    // every extra quality is another transformation variant to pay for.
    qualities: [75],
  },

  typedRoutes: true,
};

export default nextConfig;
