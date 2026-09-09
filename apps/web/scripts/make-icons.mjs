/**
 * Generate the PWA icons.
 *
 *   node apps/web/scripts/make-icons.mjs
 *
 * Run once and commit the output — this is a build-time asset, not a runtime
 * route. The manifest needs real files at real sizes or the app is not
 * installable, and on iOS "installable" is the precondition for push existing
 * at all (Safari 16.4+ only delivers to a home-screen install).
 *
 * The mark is drawn as SVG and rasterised by `next/og`, which is already a
 * dependency. Ochre on cream, both from `@noghost/ui-tokens` — the ghost is the
 * brand's one piece of iconography and it should not be a letter in a box.
 */
import { ImageResponse } from "next/og.js";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, "..", "public");

const CREAM = "#FAF7F2";
const OCHRE = "#B8741A";

/**
 * A ghost: a dome for the head, a body, and three scallops along the bottom.
 * `padding` insets the mark so a maskable icon can be cropped to a circle
 * without losing its chin.
 */
function ghostSvg({ background, ink, padding }) {
  const S = 512;
  const m = padding;
  const w = S - m * 2;
  const top = m;
  const r = w / 2;
  const cx = S / 2;
  const domeBottom = top + r;
  const bodyBottom = S - m - r * 0.28;
  const scallop = r * 0.28;

  // Dome, straight sides, then three arcs back across the base.
  const path = [
    `M ${m} ${bodyBottom}`,
    `L ${m} ${domeBottom}`,
    `A ${r} ${r} 0 0 1 ${S - m} ${domeBottom}`,
    `L ${S - m} ${bodyBottom}`,
    `A ${scallop} ${scallop} 0 0 1 ${S - m - scallop * 2} ${bodyBottom}`,
    `A ${scallop} ${scallop} 0 0 0 ${cx} ${bodyBottom}`,
    `A ${scallop} ${scallop} 0 0 1 ${m + scallop * 2} ${bodyBottom}`,
    `A ${scallop} ${scallop} 0 0 0 ${m} ${bodyBottom}`,
    "Z",
  ].join(" ");

  const eyeY = domeBottom - r * 0.1;
  const eyeDx = r * 0.36;
  const eyeR = r * 0.13;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" fill="${background}"/>
  <path d="${path}" fill="${ink}"/>
  <circle cx="${cx - eyeDx}" cy="${eyeY}" r="${eyeR}" fill="${background}"/>
  <circle cx="${cx + eyeDx}" cy="${eyeY}" r="${eyeR}" fill="${background}"/>
</svg>`;
}

/** `file` is a name under public/, or an absolute path for anything outside it. */
async function render(svg, size, file) {
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const response = new ImageResponse(
    {
      type: "div",
      props: {
        style: { display: "flex", width: "100%", height: "100%" },
        children: {
          type: "img",
          props: { src, width: size, height: size, style: { width: "100%", height: "100%" } },
        },
      },
    },
    { width: size, height: size },
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  const target = file.startsWith("/") ? file : resolve(PUBLIC, file);
  await writeFile(target, bytes);
  const shown = target.slice(target.indexOf("apps/web/") + "apps/web/".length);
  console.log(`  ${shown.padEnd(34)} ${size}x${size}  ${(bytes.length / 1024).toFixed(1)} KB`);
}

await mkdir(PUBLIC, { recursive: true });

console.log("\nWriting PWA icons to apps/web/public\n");

// Standard icons: the mark on cream, the way it appears everywhere else.
const standard = ghostSvg({ background: CREAM, ink: OCHRE, padding: 96 });
await render(standard, 192, "icon-192.png");
await render(standard, 512, "icon-512.png");

/*
 * Maskable: full-bleed ochre with the mark inside the 40% safe zone, because
 * Android crops this one to whatever shape the launcher uses. A maskable icon
 * that reuses the padded artwork loses its edges.
 */
const maskable = ghostSvg({ background: OCHRE, ink: CREAM, padding: 150 });
await render(maskable, 512, "icon-maskable-512.png");

/*
 * iOS ignores the manifest's icons for the home-screen image and looks for
 * `<link rel="apple-touch-icon">`. Next emits that link only for
 * `app/apple-icon.png` — the same file under `public/` is served and never
 * referenced, which is a file that looks like it is doing something.
 */
await render(standard, 180, resolve(HERE, "..", "src", "app", "apple-icon.png"));

console.log("\nDone. Commit these — they are build-time assets.\n");
