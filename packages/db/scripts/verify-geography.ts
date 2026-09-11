/**
 * Does the database keep the promise the product makes about location?
 *
 * 0028 replaced Atlanta's neighborhood clusters with a coordinate, and the
 * whole thing rests on three claims that are easy to write down and easy to
 * break silently:
 *
 *   1. The stored point is deliberately coarse. Not "we round it on the way
 *      in" — the column is numeric(_,3), so a caller that forgets, or a client
 *      that is not ours, still cannot store more than ~110 metres of precision.
 *   2. Half a point, a swapped pair, or a radius in the wrong unit is refused
 *      rather than stored. A latitude of -84 is a real place, in the ocean.
 *   3. `travel_radius_km` is matching input and nothing else. A member learning
 *      that somebody set 5km narrows where they live far more than the rounded
 *      point does, so it must not appear in `visible_profiles`.
 *
 *   pnpm db:verify:geography
 *
 * Needs nothing running. Builds and removes its own profiles.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { distanceKm, withinReach } from "@noghost/logic";
import { ENV_PATH, loadRepoEnv } from "./env";
import { generateSeedProfiles } from "../src/seed/data";

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

const A = { id: "deadbeef-0000-4000-8000-0000000060a1", email: "geo-a@noghost.test" };
const B = { id: "deadbeef-0000-4000-8000-0000000060a2", email: "geo-b@noghost.test" };
const PASSWORD = "probe-only-not-a-real-account-9c71";

// Real places, so a failure names somewhere rather than a number.
const MIDTOWN = { lat: 33.781, lng: -84.384 };
const DECATUR = { lat: 33.775, lng: -84.296 };

async function signIn(email: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: SupabaseClient<any> = createClient(URL_!, PUBLISHABLE!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw new Error(`sign in ${email}: ${error?.message}`);
  return c;
}

/** Is 0028 actually applied? Asked by writing, not by reading a catalog. */
async function has0028(): Promise<boolean> {
  const { error } = await service.from("profiles").select("lat,lng,travel_radius_km").limit(1);
  return !(error && /column .* does not exist|lat/i.test(error.message));
}

async function teardown() {
  const ids = [A.id, B.id];
  await service.from("profiles").delete().in("id", ids);
  const { data: page } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of page?.users ?? []) {
    if (u.email === A.email || u.email === B.email) await service.auth.admin.deleteUser(u.id);
  }
  for (const id of ids) await service.auth.admin.deleteUser(id).catch(() => {});
}

async function setup() {
  for (const who of [A, B]) {
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
}

/** Write a point as the service role and report what came back out. */
async function store(id: string, row: Record<string, unknown>) {
  const { error } = await service.from("profiles").update(row).eq("id", id);
  if (error) return { refused: true as const, message: error.message };
  const { data } = await service
    .from("profiles").select("lat,lng,travel_radius_km").eq("id", id).single();
  return { refused: false as const, row: data as Record<string, unknown> };
}

async function main() {
  console.log("\nGeography — is the point as coarse as we promised, and is the radius private?");

  const applied = await has0028();
  console.log(`\n${D}0028: profiles.lat/lng/travel_radius_km ${applied ? "present" : "MISSING"}${X}`);

  await teardown();
  await setup();

  try {
    section("The column is the promise");
    if (!applied) {
      skip("apply 0028_geography_instead_of_atlanta.sql");
    } else {
      {
        // A GPS fix, unrounded, straight at the database — the case where our
        // own client is bypassed and the guarantee has to hold anyway.
        const out = await store(A.id, { lat: 33.78151234, lng: -84.38359876 });
        const lat = Number(out.refused ? NaN : out.row.lat);
        const lng = Number(out.refused ? NaN : out.row.lng);
        check(!out.refused && lat === 33.782 && lng === -84.384,
          "an unrounded GPS fix is stored coarse, not as sent",
          out.refused ? out.message : `33.78151234 → ${lat}, -84.38359876 → ${lng}`);
        // The number that matters: what somebody could learn from the stored
        // value about where the real one was.
        const err = distanceKm({ lat: 33.78151234, lng: -84.38359876 }, { lat, lng }) * 1000;
        check(err > 1, "and the discarded precision is real distance, not a rounding artifact",
          `${err.toFixed(0)}m of uncertainty introduced`);
      }
      {
        const out = await store(A.id, { lat: 33.7812345678, lng: -84.3839999 });
        check(!out.refused, "more decimals than the column holds is truncated, not rejected",
          out.refused ? out.message : `${out.row.lat}, ${out.row.lng}`);
      }
    }

    section("A wrong point is refused, not stored");
    if (!applied) {
      skip("apply 0028_geography_instead_of_atlanta.sql");
    } else {
      {
        /*
         * A longitude sitting in the latitude column — what a swapped pair
         * looks like for most of the planet, and the reason the range check
         * exists at all.
         *
         * Stated narrowly on purpose. A range check CANNOT see a swap where
         * both numbers happen to fall inside ±90: Atlanta's own pair, reversed,
         * is a valid point in the Southern Ocean and the database has no way to
         * know it was not meant. That case is held off by the columns being
         * named rather than positional, everywhere from the browser to the
         * geocoder — never by this constraint. Claiming otherwise here would be
         * a green tick over a hole.
         */
        const out = await store(A.id, { lat: -108.5, lng: 33.781 });
        check(out.refused, "a longitude in the latitude column is refused",
          out.refused ? "refused" : `STORED ${out.row.lat}, ${out.row.lng}`);
      }
      {
        const out = await store(A.id, { lat: 33.781, lng: null });
        check(out.refused, "half a point is refused — Null Island is a real dataset",
          out.refused ? "refused" : `STORED ${out.row.lat}, ${out.row.lng}`);
      }
      {
        const out = await store(A.id, { lat: null, lng: null, travel_radius_km: null });
        check(!out.refused && out.row.lat === null,
          "but no point at all is allowed — members predate this column",
          out.refused ? out.message : "null accepted");
      }
      {
        // 40233 is "40233 metres" typed into a kilometre field.
        const out = await store(A.id, { travel_radius_km: 40233 });
        check(out.refused, "a radius in the wrong unit is refused",
          out.refused ? "refused" : `STORED ${out.row.travel_radius_km}`);
      }
      {
        const out = await store(A.id, { travel_radius_km: 0 });
        check(out.refused, "and a radius of zero is refused — it matches nobody, silently",
          out.refused ? "refused" : `STORED ${out.row.travel_radius_km}`);
      }
    }

    section("What one member may learn about another");
    if (!applied) {
      skip("apply 0028_geography_instead_of_atlanta.sql");
    } else {
      await store(A.id, { ...MIDTOWN, travel_radius_km: 5 });
      await store(B.id, { ...DECATUR, travel_radius_km: 50 });
      const member = await signIn(B.email);

      {
        /*
         * Asked as a column question, not a row question. `can_view_profile()`
         * gates the view on a live drop or connection, so two unconnected
         * probes legitimately see zero rows — and zero rows would let a view
         * that leaks the radius pass by returning nothing. PostgREST answers
         * for a column that does not exist with 42703 whether or not any row
         * matches, which is exactly the question being asked.
         */
        const point = await member.from("visible_profiles").select("lat,lng").limit(1);
        check(!point.error,
          "the view carries the point, so a distance can be bucketed",
          point.error ? point.error.message : "lat, lng present");

        const radius = await member.from("visible_profiles").select("travel_radius_km").limit(1);
        check(radius.error?.code === "42703",
          "and never the radius — it narrows a home far more than the point does",
          radius.error ? `refused: ${radius.error.code}` : "EXPOSED");
      }
      {
        // The point is in the view; the raw table must still be shut. RLS
        // restricts rows, not columns, so this is a row test on purpose.
        const { data } = await member.from("profiles").select("lat,lng,travel_radius_km").eq("id", A.id);
        check((data?.length ?? 0) === 0,
          "and the raw profiles row stays closed to another member",
          `${data?.length ?? 0} row(s)`);
      }
    }

    section("The radius actually decides");
    if (!applied) {
      skip("apply 0028_geography_instead_of_atlanta.sql");
    } else {
      // Not a DB assertion — this is the arithmetic the drop builder runs on
      // the rows above, checked against the rows as stored rather than fixtures.
      const { data } = await service
        .from("profiles").select("id,lat,lng,travel_radius_km").in("id", [A.id, B.id]);
      const a = data?.find((r: { id: string }) => r.id === A.id);
      const b = data?.find((r: { id: string }) => r.id === B.id);
      if (!a?.lat || !b?.lat) {
        skip("probe points did not store");
      } else {
        const pa = { lat: Number(a.lat), lng: Number(a.lng) };
        const pb = { lat: Number(b.lat), lng: Number(b.lng) };
        const km = distanceKm(pa, pb);
        check(km > 5 && km < 15, "the two probes are a real distance apart", `${km.toFixed(1)}km`);
        check(!withinReach(pa, a.travel_radius_km, pb, b.travel_radius_km),
          "the smaller radius decides — one willing traveller is not enough",
          `${a.travel_radius_km}km vs ${b.travel_radius_km}km over ${km.toFixed(1)}km`);
        check(withinReach(pa, 50, pb, b.travel_radius_km),
          "and when both are willing, they reach");
      }
    }

    section("The fixtures have somewhere to be");
    {
      /*
       * By id, not by `like("id", "deadbeef-%")`. `id` is a uuid and Postgres
       * has no LIKE for it, so that filter errors and hands back null — which
       * reads here as "no fixtures yet" and skips a section that should have
       * failed. Asking for the exact ids the generator produces cannot do that.
       */
      const ids = generateSeedProfiles().map((p) => p.id);
      const { data, error } = await service
        .from("profiles").select("id,lat,lng,travel_radius_km").in("id", ids);
      const seeded = data ?? [];
      if (error) {
        check(false, "seeded profiles could be read", error.message);
      } else if (seeded.length === 0) {
        skip("no seeded profiles — run pnpm db:seed:remote");
      } else {
        const withPoint = seeded.filter((r: { lat: number | null }) => r.lat !== null);
        check(withPoint.length === seeded.length,
          "every seeded profile has a point", `${withPoint.length}/${seeded.length}`);
        // Identical coordinates would hand every seeded pair the full proximity
        // bonus and make the scorer look like it was working.
        const distinct = new Set(seeded.map((r: { lat: unknown; lng: unknown }) => `${r.lat},${r.lng}`));
        check(distinct.size === seeded.length,
          "and they are scattered, not stacked on one point",
          `${distinct.size} distinct of ${seeded.length}`);
      }
    }
  } finally {
    section("Teardown");
    await teardown();
    console.log(`  ${D}probe profiles removed${X}`);
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
