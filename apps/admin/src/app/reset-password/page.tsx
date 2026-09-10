import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { RequestForm, SetForm } from "./form";

export const metadata: Metadata = { title: "Reset password" };
export const dynamic = "force-dynamic";

/**
 * One page, three states, because they are the same task at different points:
 * ask for a link, act on one, or be told the one you had is no good.
 *
 * `state=set` is only reached through `/auth/confirm`, which has already
 * exchanged the token for a recovery session — the form below acts on that
 * session rather than on anything in the URL, so there is nothing here worth
 * forging.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;

  if (state === "set") {
    return (
      <AuthShell title="Choose a new password" lead="Then sign in with it and your code.">
        <SetForm />
      </AuthShell>
    );
  }

  const stale = state === "expired" || state === "bad-link";

  return (
    <AuthShell
      title="Reset your password"
      lead={
        stale
          ? "That link is no longer any good — they last an hour and work once."
          : "We'll email you a link. It expires in an hour."
      }
      footer={
        <p>
          Resetting a password does not touch your authenticator. If you have lost that too, ask
          another admin — there is deliberately no way to remove it from here.
        </p>
      }
    >
      <RequestForm />
      <p className="mt-6 text-[14px]">
        <Link href="/sign-in" className="underline underline-offset-4 hover:text-[var(--text-primary)]">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
