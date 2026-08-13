"use client";

import { useActionState } from "react";
import { BRAND, interpolate } from "@noghost/config";
import { MEMBER_WARNING } from "@noghost/config/copy";
import { Button } from "@/components/ui/button";
import { acknowledgeWarning, type AcknowledgeState } from "./actions";

const initial: AcknowledgeState = {};

/*
 * The standards live on the marketing site, not in the member app, so this
 * links out. Inlined at build time like any `NEXT_PUBLIC_` value, with the
 * brand domain as the fallback — a warning must not lose its one link because
 * an env var is missing.
 */
const STANDARDS = `${process.env.NEXT_PUBLIC_MARKETING_URL ?? `https://${BRAND.DOMAIN}`}/community-standards`;

/**
 * The warning, and nothing else — spec §7.3's "warn member".
 *
 * It replaces the app rather than sitting on top of it. A banner is something
 * you learn to scroll past, and a moderator who decided somebody needed telling
 * should not have that decision reduced to a dismissible strip. One screen, one
 * button, and the app comes back the moment it is pressed.
 *
 * The button says "I've read this" and not "I agree". Somebody who thinks the
 * decision is wrong still has to acknowledge it before carrying on, and making
 * them click a word they disagree with to get their account back would be a
 * small coercion for no gain — the appeal line right above it is the honest
 * route, and it is why that line is on this screen rather than in an email
 * nobody sent.
 */
export function WarningScreen({ id, category }: { id: string; category: string }) {
  const [state, action, pending] = useActionState(acknowledgeWarning, initial);
  const vars = { CATEGORY: category, SUPPORT_EMAIL: BRAND.SUPPORT_EMAIL };

  return (
    <div className="mx-auto w-full max-w-[36rem] px-6 py-16">
      <h1 className="font-[family-name:var(--font-display)] text-[30px] font-extrabold leading-[1.15] tracking-[-0.03em]">
        {MEMBER_WARNING.title}
      </h1>

      <div className="mt-6 space-y-4 text-[17px] leading-relaxed text-[var(--text-secondary)]">
        <p>{interpolate(MEMBER_WARNING.lead)}</p>
        <p className="text-[var(--text-primary)]">{interpolate(MEMBER_WARNING.category, vars)}</p>
        <p>{MEMBER_WARNING.privacy}</p>
        <p>{MEMBER_WARNING.consequence}</p>
        <p>
          {MEMBER_WARNING.standards}{" "}
          <a
            href={STANDARDS}
            className="underline decoration-[1.5px] underline-offset-4 hover:text-[var(--text-primary)]"
          >
            Read them
          </a>
          .
        </p>
        <p>{interpolate(MEMBER_WARNING.appeal, vars)}</p>
      </div>

      <form action={action} className="mt-10">
        <input type="hidden" name="id" value={id} />

        {state.error && (
          <p role="alert" className="mb-4 text-[15px] leading-snug text-[var(--error)]">
            {state.error}
          </p>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? "…" : MEMBER_WARNING.acknowledge}
        </Button>
      </form>
    </div>
  );
}
