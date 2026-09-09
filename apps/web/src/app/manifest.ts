import type { MetadataRoute } from "next";
import { BRAND } from "@noghost/config";

/**
 * The web app manifest — spec §10 Phase 5's "PWA manifest/SW/install flow".
 *
 * Not decoration. On iOS, Web Push only exists for an app installed to the home
 * screen (Safari 16.4+), and installability requires a valid manifest with real
 * icons — so this file is a precondition for half the cohort being reachable at
 * all, not a nicety on top of the notifications work.
 *
 * `start_url` is `/tonight` rather than `/`: somebody who installed this did so
 * to be in the season, and `/` is the marketing site.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.APP_NAME} — ${BRAND.TAGLINE}`,
    short_name: BRAND.APP_NAME,
    description: BRAND.PITCH,
    start_url: "/tonight",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FAF7F2",
    theme_color: "#FAF7F2",
    categories: ["social", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      /*
       * Separate artwork, not the same file relabelled. Android crops a
       * maskable icon to the launcher's shape, so this one is full-bleed with
       * the mark inside the safe zone — reusing the padded version would show
       * a small ghost floating in a cropped square.
       */
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
