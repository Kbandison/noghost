import { redirect } from "next/navigation";
import type { MemberStatus } from "@noghost/types";
import { supabaseServer } from "./supabase";

/**
 * The member gate — who is allowed into the app, and where everyone else goes.
 *
 * Four separate conditions, and the order matters because each one has a
 * different right answer:
 *
 *   1. a session exists                → otherwise sign in
 *   2. they have a profile             → otherwise they never finished applying
 *   3. they are a member of a season   → otherwise their application is the story
 *   4. their account is active         → paused and graduated are not errors
 *
 * Membership is read from `season_members`, which is the row the Stripe webhook
 * writes. An admitted application is a promise of a seat, not a seat.
 *
 * Like the admin console: this protects rendering. Every Server Action
 * re-checks, because an action is a POST endpoint a client can invoke without
 * passing through the layout that "protects" it.
 */

export interface Member {
  id: string;
  firstName: string;
  status: MemberStatus;
  seasonId: string;
}

type Gate =
  | { ok: true; member: Member }
  | { ok: false; reason: "signed-out" | "no-profile" | "not-a-member" };

export async function memberGate(): Promise<Gate> {
  const supabase = await supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "signed-out" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,first_name,status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return { ok: false, reason: "no-profile" };

  /*
   * A member can in principle belong to more than one season across the life of
   * the product, so this takes the most recent. Not `.single()`: a second row
   * appearing in Season Two must not throw on a page that only wants to know
   * where you are now.
   */
  const { data: membership } = await supabase
    .from("season_members")
    .select("season_id,joined_at")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!membership) return { ok: false, reason: "not-a-member" };

  return {
    ok: true,
    member: {
      id: profile.id,
      firstName: profile.first_name,
      // Deliberately not a gate condition. `paused` and `found_someone` are
      // states the app has screens for, not failures to redirect away from —
      // bouncing someone who paused their account out of their own app would
      // be a punishment for using a feature.
      status: profile.status,
      seasonId: membership.season_id,
    },
  };
}

export async function requireMember(): Promise<Member> {
  const gate = await memberGate();
  if (gate.ok) return gate.member;

  switch (gate.reason) {
    case "signed-out":
      redirect("/sign-in");
    case "no-profile":
      // They have an account but never finished the funnel. The draft is still
      // in their cookie, so this resumes rather than restarts.
      redirect("/apply/start");
    case "not-a-member":
      // Under review, waitlisted, admitted-but-unclaimed, or rejected. The
      // review screen already reads their application and says which.
      redirect("/apply/review");
  }
}
