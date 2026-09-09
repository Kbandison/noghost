"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/member";
import { supabaseServer } from "@/lib/supabase";
import type { SettingsState } from "./actions";

/**
 * Registering and retiring this browser's push subscription.
 *
 * Written through the member's own session so `owner manages own push
 * subscriptions` is what scopes it — nothing here checks the user id itself,
 * because a policy that already says it is better than a second check that can
 * drift from the first.
 *
 * The endpoint is the subscription's identity: the same browser re-subscribing
 * hands back the same URL, so this upserts on it. That also means signing into
 * a second account on a shared device *moves* the endpoint rather than
 * duplicating it, which is the behaviour you want — one browser, one person
 * being notified.
 */

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function savePushSubscription(
  subscription: PushSubscriptionInput,
  userAgent: string,
): Promise<SettingsState> {
  const member = await requireMember();

  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return { error: "That subscription is missing its keys. Try turning it off and on again." };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: member.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: userAgent.slice(0, 400),
      // Re-subscribing revives a subscription the sweep had retired.
      expired_at: null,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    console.error(`[push] subscribe ${member.id}: ${error.message}`);
    if (/push_subscriptions/i.test(error.message) && /does not exist|schema cache/i.test(error.message)) {
      return {
        error:
          "This database hasn't had 0022_notifications_that_arrive.sql applied, so there's " +
          "nowhere to store a subscription yet.",
      };
    }
    return { error: "Couldn't turn notifications on. Try again." };
  }

  revalidatePath("/profile");
  return { saved: true };
}

export async function removePushSubscription(endpoint: string): Promise<SettingsState> {
  const member = await requireMember();

  const supabase = await supabaseServer();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);

  if (error) {
    console.error(`[push] unsubscribe ${member.id}: ${error.message}`);
    return { error: "Couldn't turn notifications off. Try again." };
  }

  revalidatePath("/profile");
  return { saved: true };
}
