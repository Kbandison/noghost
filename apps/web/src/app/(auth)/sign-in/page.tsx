import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { memberGate } from "@/lib/member";
import { SignInForm } from "./form";

export const metadata: Metadata = {
  title: "Sign in",
  // Nothing here should ever appear in a search result.
  robots: { index: false, follow: false },
};

export default async function SignInPage() {
  /*
   * Someone already signed in has no business on this page, and sending them
   * to the gate rather than to `/tonight` keeps one source of truth for where a
   * member belongs — that might be the funnel if they never finished it.
   */
  const gate = await memberGate();
  if (gate.ok) redirect("/tonight");

  return (
    <div className="w-full max-w-[26rem]">
      <h1 className="font-[family-name:var(--font-display)] text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em]">
        Welcome back.
      </h1>
      <p className="mt-3 text-[16px] leading-relaxed text-[var(--text-secondary)]">
        We&rsquo;ll text you a six-digit code. Same number you applied with.
      </p>

      <div className="mt-8">
        <SignInForm />
      </div>

      <p className="mt-10 border-t border-[var(--border-subtle)] pt-6 text-[15px] text-[var(--text-secondary)]">
        Haven&rsquo;t applied yet?{" "}
        <Link
          href="/apply"
          className="text-[var(--accent-text)] underline decoration-[1.5px] underline-offset-4"
        >
          Start an application
        </Link>
        .
      </p>
    </div>
  );
}
