import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { supabaseServer } from "@/lib/supabase";
import { EnrolForm } from "./form";

export const metadata: Metadata = { title: "Set up two-factor" };
export const dynamic = "force-dynamic";

export default async function SetUpPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // Already enrolled and already challenged — nothing to do here.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect("/");

  return (
    <AuthShell
      title="Add two-factor"
      lead="Required before the console opens. Use any authenticator app — 1Password, Authy, Google Authenticator."
      footer={
        <p>
          A password on its own isn&rsquo;t a proportionate guard on this data. Enrolment happens
          once per device.
        </p>
      }
    >
      <EnrolForm />
    </AuthShell>
  );
}
