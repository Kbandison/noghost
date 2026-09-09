import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The monorepo's one `.env.local`, for scripts run from the repo root.
 *
 * These scripts used to reach into `apps/web/.env.local` — a script run from
 * the root, borrowing an app's private configuration. That was already the
 * wrong way round, and it is why there were two env files to begin with: the
 * console's copy existed only because nothing else would read the web app's.
 *
 * Loaded rather than required, because `db:verify` is expected to be runnable
 * on a machine where the values come from the shell or from CI instead.
 */
export const ENV_PATH = resolve(process.cwd(), ".env.local");

export function loadRepoEnv(): void {
  if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);
}
