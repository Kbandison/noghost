import { loadEnvConfig } from "@next/env";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * One environment for the whole monorepo.
 *
 * Both apps used to carry their own `.env.local` holding the same six values —
 * the same Supabase project, the same keys, twice. Two copies of a secret are
 * two things that can drift, and the way that fails is quiet: the member app
 * pointed at one project while the console reads another, with every screen in
 * both looking exactly as it should.
 *
 * Next has no option for this. It loads `.env*` from the app directory and only
 * from there — there is no `envDir`, and `.env.*` files "should remain in the
 * root of your project" per its own guide. So the root file is loaded
 * explicitly, from `next.config.ts`, which Next evaluates before it resolves
 * anything else. `NEXT_PUBLIC_*` values are inlined from `process.env` during
 * compilation, which happens later, so they arrive in the browser bundle the
 * same way they always did.
 *
 * `loadEnvConfig` is Next's own loader — the one it uses internally — so the
 * precedence rules are the ones documented rather than a second set invented
 * here. It does not overwrite variables already in `process.env`, which is what
 * lets a real shell variable or a Vercel-injected one still win.
 */
const ROOT = dirname(fileURLToPath(import.meta.url));

export function loadRootEnv(): void {
  loadEnvConfig(ROOT, process.env.NODE_ENV !== "production");
}
