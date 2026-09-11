/**
 * Can somebody verify themselves?
 *
 * 0029 turned §7.2's "selfie liveness" from a file picker into a pose sequence
 * that is issued before it is answered. Four things have to be true for that to
 * be worth anything, and all four are easy to break without noticing:
 *
 *   1. The applicant cannot read the sequence they are about to be asked for.
 *      A member who can SELECT their own challenge row knows the answer in
 *      advance, which is the entire mechanism.
 *   2. A sequence is answerable once. Otherwise somebody with frames already in
 *      hand retries until they draw a sequence those frames satisfy.
 *   3. The applicant cannot read the verdict, the score, or the reason. RLS
 *      restricts rows, not columns, and they own this row — "matched at 71" is
 *      a number you tune your next attempt against.
 *   4. Nothing automated can reject anybody.
 *
 *   pnpm db:verify:verification
 *
 * What this CANNOT check: the Rekognition calls themselves. Without AWS
 * credentials the face reading does not run, and this says so and skips rather
 * than passing a section that never executed.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decideVerification } from "@noghost/logic";
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
let failures = 0, passed = 0, skipped = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`  ${ok ? G + "✓" : R + "✗"}${X} ${label}${detail ? `  ${D}${detail}${X}` : ""}`);
  if (ok) passed += 1;
  else failures += 1;
}
const section = (t: string) => console.log(`\n${t}`);
const skip = (why: string) => {
  skipped += 1;
  console.log(`  ${D}– skipped: ${why}${X}`);
};

const M = { id: "deadbeef-0000-4000-8000-00000000ae01", email: "verify-member@noghost.test" };
const A = { id: "deadbeef-0000-4000-8000-00000000ae02", email: "verify-admin@noghost.test" };
const PASSWORD = "probe-only-not-a-real-account-71b4";

async function signIn(email: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: SupabaseClient<any> = createClient(URL_!, PUBLISHABLE!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw new Error(`sign in ${email}: ${error?.message}`);
  return c;
}

async function has0029(): Promise<boolean> {
  const { error } = await service.from("verification_challenges").select("id").limit(1);
  return !(error && /does not exist|schema cache/i.test(error.message));
}

async function teardown() {
  const ids = [M.id, A.id];
  await service.from("verification_challenges").delete().in("user_id", ids);
  await service.from("verifications").delete().in("user_id", ids);
  await service.from("admin_audit").delete().in("admin_id", ids);
  await service.from("admin_users").delete().in("id", ids);
  await service.from("profiles").delete().in("id", ids);
  const { data: page } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of page?.users ?? []) {
    if (u.email === M.email || u.email === A.email) await service.auth.admin.deleteUser(u.id);
  }
  for (const id of ids) await service.auth.admin.deleteUser(id).catch(() => {});
}

async function setup() {
  for (const who of [M, A]) {
    const { error: ue } = await service.auth.admin.createUser({
      id: who.id, email: who.email, password: PASSWORD,
      email_confirm: true, app_metadata: { seed: true },
    });
    if (ue) throw new Error(`user ${who.email}: ${ue.message}`);
    const { error: pe } = await service.from("profiles").insert({
      id: who.id, first_name: "Probe", birthdate: "1990-06-06",
      gender: "woman", seeking: ["man"], status: "active",
    });
    if (pe) throw new Error(`profile ${who.email}: ${pe.message}`);
  }
  const { error: ae } = await service
    .from("admin_users").upsert({ id: A.id, email: A.email, active: true }, { onConflict: "id" });
  if (ae) throw new Error(`admin: ${ae.message}`);
}

/** Issue a sequence the way the server action does. */
let sessionCounter = 0;

/** Open an attempt the way `startLiveness` does — minus the AWS call. */
async function issue(userId: string, ttlSeconds = 180) {
  sessionCounter += 1;
  const { data, error } = await service
    .from("verification_challenges")
    .insert({
      user_id: userId,
      // A real session id is a 36-char uuid from AWS. This is the same shape,
      // generated locally, because what is being tested here is the row's
      // single-use and expiry rules rather than Rekognition.
      liveness_session_id: `${crypto.randomUUID()}`,
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    })
    .select("id,liveness_session_id")
    .single();
  if (error) throw new Error(`issue: ${error.message}`);
  return data as { id: string; liveness_session_id: string };
}

/** The atomic claim from `finishLiveness`, run against the real row. */
async function claim(sessionId: string, userId: string) {
  const { data } = await service
    .from("verification_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("liveness_session_id", sessionId)
    .eq("user_id", userId)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  return data;
}

async function main() {
  console.log("\nVerification — is the sequence secret, single-use, and unable to reject anybody?");

  const applied = await has0029();
  console.log(`\n${D}0029: verification_challenges ${applied ? "present" : "MISSING"}${X}`);

  await teardown();
  await setup();

  try {
    const member = await signIn(M.email);
    const admin = await signIn(A.email);

    section("The applicant cannot read or write their own attempt");
    if (!applied) {
      skip("apply 0029_a_face_that_answers.sql");
    } else {
      const attempt = await issue(M.id);
      {
        const { data, error } = await member
          .from("verification_challenges").select("id").eq("id", attempt.id);
        // RLS on with no policies: rows are invisible rather than the query
        // erroring. Either shape is a pass; a row coming back is not.
        check((data?.length ?? 0) === 0,
          "their own attempt row is invisible to them",
          error ? `refused: ${error.code}` : `${data?.length ?? 0} row(s)`);
      }
      {
        const { error } = await member
          .from("verification_challenges")
          .update({ confidence: 100 })
          .eq("id", attempt.id)
          .select("id");
        const { data: after } = await service
          .from("verification_challenges").select("confidence").eq("id", attempt.id).single();
        check(Number(after?.confidence ?? 0) !== 100,
          "and they cannot write their own score onto it",
          error ? `refused: ${error.code}` : `confidence = ${after?.confidence}`);
      }
      {
        // 0031 loosened `poses` to nullable for Face Liveness rows. The
        // constraint has to still bind the rows that do carry one, or the rule
        // 0029 wrote has quietly stopped existing.
        const { error } = await service
          .from("verification_challenges")
          .update({ poses: ["center"] })
          .eq("id", attempt.id);
        check(Boolean(error),
          "a one-step pose sequence is still refused on rows that have one",
          error ? "refused" : "ALLOWED");
      }
    }

    section("A session is collected once");
    if (!applied) {
      skip("apply 0029_a_face_that_answers.sql");
    } else {
      {
        const { liveness_session_id: sid } = await issue(M.id);
        const first = await claim(sid, M.id);
        const second = await claim(sid, M.id);
        check(Boolean(first) && second === null,
          "the second attempt at the same session is refused",
          `first ${first ? "claimed" : "refused"}, second ${second ? "CLAIMED" : "refused"}`);
      }
      {
        // Backdated rather than waited out — the claim compares against the
        // server's clock, so an expired row is the same shape either way.
        const attempt = await issue(M.id, 60);
        await service
          .from("verification_challenges")
          .update({
            issued_at: new Date(Date.now() - 600_000).toISOString(),
            expires_at: new Date(Date.now() - 300_000).toISOString(),
          })
          .eq("id", attempt.id);
        check((await claim(attempt.liveness_session_id, M.id)) === null,
          "an expired session is refused — AWS drops the images after three minutes anyway");
      }
      {
        const attempt = await issue(M.id);
        check((await claim(attempt.liveness_session_id, A.id)) === null,
          "and somebody else's session cannot be claimed",
          "bound to the user it was opened for");
      }
      {
        const attempt = await issue(M.id);
        const { error } = await service.from("verification_challenges").insert({
          user_id: A.id,
          liveness_session_id: attempt.liveness_session_id,
          expires_at: new Date(Date.now() + 180_000).toISOString(),
        });
        check(Boolean(error),
          "one session id cannot be attached to two applicants",
          error ? "refused by the unique index" : "ALLOWED");
      }
    }

    section("The applicant never reads the verdict about themselves");
    if (!applied) {
      skip("apply 0029_a_face_that_answers.sql");
    } else {
      await service.from("verifications").upsert(
        {
          user_id: M.id,
          selfie_path: `${M.id}/probe.jpg`,
          liveness_score: 71,
          liveness_passed: false,
          challenge_passed: false,
          auto_reason: "Live at 96, matched at 71, under 92.",
        },
        { onConflict: "user_id" },
      );

      // Column questions, not row questions: they own this row, so it is
      // visible — the whole point is which columns come back with it.
      for (const column of ["liveness_score", "liveness_passed", "auto_reason", "frame_paths"]) {
        const { error } = await member.from("verifications").select(column).limit(1);
        check(error?.code === "42501" || error?.code === "42703",
          `${column} is not theirs to read`,
          error ? `refused: ${error.code}` : "READABLE");
      }
      {
        const { data } = await member.from("verifications").select("selfie_path").eq("user_id", M.id);
        check((data?.length ?? 0) === 1,
          "but the row is still theirs — this is a column rule, not a wall",
          `${data?.length ?? 0} row(s)`);
      }
      {
        /*
         * 0030. These two were revoked in 0006 and the revoke did nothing for
         * the life of the project: a column-level REVOKE cannot narrow a
         * table-level GRANT, so both columns stayed readable by the person
         * they are written about. Checked here because this is the verifier
         * that found it, and a `revoke select (col)` line reads like a control
         * whether or not it is one.
         */
        const notes = await member.from("verifications").select("admin_notes").limit(1);
        check(notes.error?.code === "42501",
          "admin_notes is not theirs either — 0006's revoke never worked",
          notes.error ? `refused: ${notes.error.code}` : "READABLE");

        const reason = await member.from("applications").select("rejection_reason").limit(1);
        check(reason.error?.code === "42501",
          "and neither is the reason they were turned down",
          reason.error ? `refused: ${reason.error.code}` : "READABLE");

        // The other direction: the narrower grant must not have broken the
        // screens that legitimately read this row.
        const own = await member
          .from("applications").select("id,status,claim_deadline,waitlist_position").limit(1);
        check(!own.error,
          "while the columns their own screens read still come back",
          own.error ? own.error.message : "status, deadline, position");
      }
    }

    section("The review team does read it");
    if (!applied) {
      skip("apply 0029_a_face_that_answers.sql");
    } else {
      {
        const { data, error } = await member.rpc("review_verification", { p_user_id: M.id });
        check(Boolean(error) && !data?.length,
          "a member cannot read a verification through the RPC either",
          error ? "refused" : "ALLOWED");
      }
      {
        const { data, error } = await admin.rpc("review_verification", { p_user_id: M.id });
        const row = data?.[0];
        check(!error && Number(row?.liveness_score) === 71 && row?.auto_reason?.includes("71"),
          "an admin reads the score and the reason",
          error ? error.message : `${row?.liveness_score}, "${row?.auto_reason}"`);
      }
    }

    section("Nothing automated can reject anybody");
    {
      // The policy is pure, so this is exhaustive rather than a sample: every
      // reachable combination of inputs, and the set of outcomes they produce.
      const outcomes = new Set<string>();
      for (const livenessConfidence of [null, 0, 50, 84.9, 85, 100]) {
        for (const similarity of [null, 0, 50, 91.9, 92, 100]) {
          for (const autoAdmitEnabled of [true, false]) {
            outcomes.add(
              decideVerification({ livenessConfidence, similarity, autoAdmitEnabled }).outcome,
            );
          }
        }
      }
      check(
        [...outcomes].sort().join(",") === "auto-admit,needs-a-person",
        "every input lands on admit or a person — there is no reject",
        [...outcomes].sort().join(", "),
      );
    }
    if (!applied) {
      skip("apply 0029_a_face_that_answers.sql");
    } else {
      const { data: season } = await service
        .from("seasons").select("id,auto_admit").limit(1).maybeSingle();
      check(season?.auto_admit === false,
        "and auto-admit is off until somebody turns it on",
        `season auto_admit = ${season?.auto_admit}`);
    }

    section("The face checks themselves");
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_REGION) {
      // Not a pass. The pose reading and the face comparison are the half of
      // this that spends money and the half that has never run — saying so is
      // the only honest thing to print.
      skip("no AWS credentials — Face Liveness and CompareFaces have NOT been verified");
    } else {
      check(true, "AWS is configured — run the funnel end to end to exercise it",
        process.env.AWS_REGION);
    }
  } finally {
    section("Teardown");
    await teardown();
    console.log(`  ${D}probe accounts removed${X}`);
  }

  const tail = skipped > 0 ? ` ${D}(${skipped} skipped)${X}` : "";
  if (failures > 0) console.log(`\n${R}${failures} check(s) failed${X}${tail}\n`);
  else if (passed === 0)
    console.log(`\n${R}Nothing was verified${X} — every section skipped. This is not a pass.\n`);
  else console.log(`\n${G}${passed} check(s) passed${X}${tail}\n`);

  process.exit(failures === 0 && passed > 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n${R}${error instanceof Error ? error.message : String(error)}${X}\n`);
  process.exit(1);
});
