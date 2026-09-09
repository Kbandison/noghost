import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";
import { loadRootEnv } from "../../env.config";

/*
 * Before anything else. The monorepo keeps one `.env.local` at its root rather
 * than a copy per app, and Next only ever looks in the app directory — so this
 * is what puts those values in `process.env` in time for `NEXT_PUBLIC_*` to be
 * inlined into the client bundle.
 */
loadRootEnv();

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

/*
 * `withBotId` adds the rewrites BotID's client script needs. It is a wrapper
 * rather than a config key, so an edit that returns `nextConfig` directly would
 * disable bot protection while leaving every call site looking correct.
 */
export default withBotId(nextConfig);
