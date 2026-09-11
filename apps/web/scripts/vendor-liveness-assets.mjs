/**
 * Copy the Face Liveness runtime assets into `public/`.
 *
 * Two reasons this is a build step rather than files somebody downloaded once.
 *
 * **Version drift.** The WebAssembly binaries have to match the JavaScript glue
 * that instantiates them, and that glue is bundled inside
 * `@tensorflow/tfjs-backend-wasm` — whichever version Amplify happens to depend
 * on. Hand-fetching from a CDN got this wrong once: the component's own type
 * definitions still document the default path as `@3.11.0`, the installed
 * version is 4.11.0, and the mismatch surfaces as
 *
 *     WebAssembly.instantiate(): Import #0 "a": module is not an object
 *     Initialization of backend wasm failed
 *     Face detection model loading timed out
 *
 * which reads like a network problem and is not one. Copying from node_modules
 * means a dependency bump brings matching binaries with it, automatically.
 *
 * **Third parties.** Left alone the component fetches these from jsDelivr, and
 * its face model from tfhub.dev — which now redirects to Kaggle. That is a
 * third-party redirect chain in the critical path of identity verification: if
 * it is blocked, slow, or moved again, nobody can verify.
 */
import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = new URL("../public/tfjs-wasm/", import.meta.url);

/*
 * Resolved THROUGH the liveness package, not from here.
 *
 * pnpm's strict layout means a transitive dependency is not reachable from the
 * app, which is the point of it. Resolving from the package that actually
 * bundles the glue code is also the more correct question to ask: what this
 * needs is the version Amplify uses, not whatever else might be installed.
 */
// `./package.json` is not in the package's `exports`, so resolve its entry
// point instead and walk up from there.
const livenessEntry = require.resolve("@aws-amplify/ui-react-liveness");
const fromLiveness = createRequire(livenessEntry);
const pkg = dirname(fromLiveness.resolve("@tensorflow/tfjs-backend-wasm/package.json"));
const from = join(pkg, "wasm-out");

await mkdir(root, { recursive: true });

let copied = 0;
for (const name of await readdir(from)) {
  // The `.wasm` binaries and the worker scripts that load the threaded build.
  // The rest of `wasm-out` is glue already inside the bundle.
  if (!name.endsWith(".wasm") && !name.endsWith(".worker.js")) continue;
  await cp(join(from, name), new URL(name, root));
  const { size } = await stat(join(from, name));
  console.log(`  ${name.padEnd(42)} ${size}b`);
  copied += 1;
}

const version = fromLiveness("@tensorflow/tfjs-backend-wasm/package.json").version;
console.log(`\n${copied} file(s) from @tensorflow/tfjs-backend-wasm@${version}`);
if (copied === 0) {
  console.error("Nothing copied — Face Liveness will fall back to a CDN or fail outright.");
  process.exit(1);
}
