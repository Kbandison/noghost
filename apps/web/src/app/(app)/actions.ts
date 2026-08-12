"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";

export async function signOut(): Promise<never> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/");
}
