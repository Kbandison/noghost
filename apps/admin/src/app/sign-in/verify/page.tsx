import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { supabaseServer } from "@/lib/supabase";
import { VerifyForm } from "./form";

export const metadata: Metadata = { title: "Verify" };
export const dynamic = "force-dynamic";

export default async function VerifyPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The password step has to have happened first; this page is not an entry
  // point on its own.
  if (!user) redirect("/sign-in");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect("/");
  if (aal?.nextLevel !== "aal2") redirect("/security/set-up");

  return (
    <AuthShell
      title="Enter your code"
      lead="Six digits from your authenticator app."
      footer={<p>Lost the device? Another admin can remove your factor so you can enrol again.</p>}
    >
      <VerifyForm />
    </AuthShell>
  );
}
