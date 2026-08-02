import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { SignInForm } from "./form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const { denied } = await searchParams;

  return (
    <AuthShell
      title="Admin sign-in"
      lead="Email, password, and a code from your authenticator."
      footer={
        <p>
          This console reads members&rsquo; dates of birth, phone numbers and verification
          selfies. Every action you take is written to the audit trail with your name on it.
        </p>
      }
    >
      {/*
       * `denied` covers both "not on the allow-list" and an expired admin
       * session. The wording avoids confirming that the address exists.
       */}
      {denied && (
        <p className="mb-6 border-l-2 border-[var(--error)] pl-3 text-[14px] leading-relaxed text-[var(--text-secondary)]">
          That account can&rsquo;t open the console. If you think it should, ask another admin to
          add you.
        </p>
      )}
      <SignInForm />
    </AuthShell>
  );
}
