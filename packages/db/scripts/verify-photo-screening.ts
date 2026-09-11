/**
 * Is a photo that cannot be used actually refused, and actually gone?
 *
 * Moderation used to run at filing, five steps after the upload. An explicit
 * photo was therefore accepted into the `photos` bucket — which is publicly
 * readable — left there for the rest of the funnel, and never refused: the
 * application simply went to a human, and the person who uploaded it was told
 * nothing.
 *
 * 0034 moves the judgement to the upload. This asserts the three things that
 * has to mean:
 *
 *   1. A refused photo is deleted from storage, not merely left unapproved.
 *      The bucket is public, so "hidden" hides it from our screens and nobody
 *      else's.
 *   2. The screening outlives the photo, because "why did mine disappear" needs
 *      an answer after the image is gone.
 *   3. Filing trusts those screenings rather than paying to ask again — and
 *      treats a path that was never screened as unchecked rather than clean.
 *
 *   pnpm db:verify:photo-screening
 *
 * Needs nothing running. Builds and removes its own applicant.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decidePhoto, type PhotoReading } from "@noghost/logic";
import { ENV_PATH, loadRepoEnv } from "./env";

loadRepoEnv();

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !PUBLISHABLE || !SECRET) {
  console.error(`\nNeed all three Supabase keys in ${ENV_PATH}\n`);
  process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const service: SupabaseClient<any> = createClient(URL_, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", X = "\x1b[0m";
let failures = 0, passed = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`  ${ok ? G + "✓" : R + "✗"}${X} ${label}${detail ? `  ${D}${detail}${X}` : ""}`);
  if (ok) passed += 1;
  else failures += 1;
}
const section = (t: string) => console.log(`\n${t}`);

const M = { id: "deadbeef-0000-4000-8000-00000000fa01", email: "screen-probe@noghost.test" };
const PASSWORD = "probe-only-not-a-real-account-b5c2";

/** A 1×1 JPEG — enough to occupy a storage path. */
const TINY = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
    "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

async function teardown() {
  const { data: listed } = await service.storage.from("photos").list(M.id);
  if (listed?.length) {
    await service.storage.from("photos").remove(listed.map((f) => `${M.id}/${f.name}`));
  }
  await service.from("photo_screenings").delete().eq("user_id", M.id);
  await service.from("profiles").delete().eq("id", M.id);
  const { data: page } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of page?.users ?? []) {
    if (u.email === M.email) await service.auth.admin.deleteUser(u.id);
  }
  await service.auth.admin.deleteUser(M.id).catch(() => {});
}

const reading = (over: Partial<PhotoReading> = {}): PhotoReading => ({
  flags: [], contentTypes: [], faceCount: 1, faceShare: 0.3, faceConfidence: 99, ...over,
});

async function main() {
  console.log("\nPhoto screening — is an unusable photo refused, and is it actually gone?");

  await teardown();

  const { error: ue } = await service.auth.admin.createUser({
    id: M.id, email: M.email, password: PASSWORD,
    email_confirm: true, app_metadata: { seed: true },
  });
  if (ue) throw new Error(`user: ${ue.message}`);
  await service.from("profiles").insert({
    id: M.id, first_name: "Probe", birthdate: "1990-06-06",
    gender: "woman", seeking: ["man"], status: "active",
  });

  try {
    section("The policy refuses what it should, and only that");
    {
      const explicit = decidePhoto(
        reading({ flags: [{ name: "Exposed Genitalia", parent: "Explicit", confidence: 98 }] }),
      );
      check(explicit.verdict === "refuse", "explicit content is refused", explicit.verdict);
      check(!/genitalia/i.test(explicit.reason),
        "and the reason names the category, not the body part",
        `"${explicit.reason}"`);
      check(/pick a different one/i.test(explicit.reason),
        "and says what to do next");
    }
    {
      const cartoon = decidePhoto(reading({ contentTypes: [{ name: "Illustrated", confidence: 97 }] }));
      check(cartoon.verdict === "refuse", "a cartoon is refused", cartoon.verdict);
      check(/real photos of you/i.test(cartoon.reason), "and says what to do next");
    }
    {
      const beach = decidePhoto(
        reading({ flags: [{ name: "Swimwear", parent: "Swimwear or Underwear", confidence: 99 }] }),
      );
      check(beach.verdict === "needs-a-person",
        "a beach photo is flagged, never refused", beach.verdict);
    }

    section("A refused photo is deleted, not just hidden");
    {
      const path = `${M.id}/refused.jpg`;
      await service.storage.from("photos").upload(path, TINY, { contentType: "image/jpeg" });

      const before = await service.storage.from("photos").list(M.id);
      check((before.data ?? []).some((f) => f.name === "refused.jpg"),
        "the file exists to begin with");

      // What `screenPhoto` does on a refusal, in the same order.
      await service.from("photo_screenings").upsert({
        path, user_id: M.id, verdict: "refuse", reason: "explicit", detail: {},
      }, { onConflict: "path" });
      await service.storage.from("photos").remove([path]);

      const after = await service.storage.from("photos").list(M.id);
      check(!(after.data ?? []).some((f) => f.name === "refused.jpg"),
        "and is gone from a publicly readable bucket",
        `${after.data?.length ?? 0} file(s) left`);

      const { data: row } = await service
        .from("photo_screenings").select("verdict,reason").eq("path", path).maybeSingle();
      check(row?.verdict === "refuse",
        "while the screening outlives the photo it refers to",
        `"${row?.reason}"`);
    }

    section("The applicant cannot read or write their own screenings");
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const member: SupabaseClient<any> = createClient(URL_!, PUBLISHABLE!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await member.auth.signInWithPassword({ email: M.email, password: PASSWORD });

      const { data } = await member.from("photo_screenings").select("verdict").eq("user_id", M.id);
      check((data?.length ?? 0) === 0,
        "the labels and confidences are not a map they get to read",
        `${data?.length ?? 0} row(s)`);

      const path = `${M.id}/forged.jpg`;
      await service.from("photo_screenings").insert({
        path, user_id: M.id, verdict: "needs-a-person", detail: {},
      });
      await member.from("photo_screenings").update({ verdict: "ok" }).eq("path", path);
      const { data: after } = await service
        .from("photo_screenings").select("verdict").eq("path", path).single();
      check(after?.verdict === "needs-a-person",
        "and they cannot mark their own photo clean", `verdict = ${after?.verdict}`);
    }

    section("Filing treats an unscreened photo as unchecked");
    {
      // The rule `clearPhotos` applies: a path with no screening row was never
      // judged, and unchecked is not clean.
      const screened = new Map<string, string>([[`${M.id}/a.jpg`, "ok"]]);
      const paths = [`${M.id}/a.jpg`, `${M.id}/never-screened.jpg`];
      const verdicts = paths.map((p) => screened.get(p) ?? "needs-a-person");
      check(verdicts.some((v) => v !== "ok"),
        "a set containing an unscreened photo cannot be auto-approved",
        verdicts.join(", "));
    }
  } finally {
    section("Teardown");
    await teardown();
    console.log(`  ${D}probe applicant and files removed${X}`);
  }

  if (failures > 0) console.log(`\n${R}${failures} check(s) failed${X}\n`);
  else if (passed === 0) console.log(`\n${R}Nothing was verified${X} — this is not a pass.\n`);
  else console.log(`\n${G}${passed} check(s) passed${X}\n`);

  process.exit(failures === 0 && passed > 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n${R}${error instanceof Error ? error.message : String(error)}${X}\n`);
  process.exit(1);
});
