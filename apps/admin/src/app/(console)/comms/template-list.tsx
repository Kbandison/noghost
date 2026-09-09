"use client";

import { useActionState, useState } from "react";
import { BRAND } from "@noghost/config";
import { Button } from "@/components/ui";
import type { TemplateRow } from "@/lib/comms";
import { sendTest, type TestState } from "./actions";

const initial: TestState = {};

/**
 * Every notification in §8, with what it says and whether anyone can receive it.
 *
 * The point of listing all seventeen rather than the ones that work is the gaps:
 * a template the matrix routes to push with no §9.4 line is one that will be
 * skipped `no-copy` by the sweep forever, and this is the only screen where
 * that is visible before it happens in production.
 */

/** Sample values, obviously fake — see the note in `actions.ts`. */
const SAMPLES: Record<string, string> = {
  FIRST_NAME: "Maya",
  APP_NAME: BRAND.APP_NAME,
  APP_URL: BRAND.APP_URL,
  PROMPT_TOPIC: "your unpopular food opinion",
  PLACE: "Ponce City Market",
  DAY: "Thursday",
  SEASON_NAME: BRAND.SEASON_S1_NAME,
};

const fill = (line: string) =>
  line.replace(/\{\{([A-Z_]+)\}\}/g, (whole, token: string) => SAMPLES[token] ?? whole);

const hours = (ttl: number | null) => (ttl === null ? "never goes stale" : `stale after ${ttl}h`);

export function TemplateList({ templates }: { templates: TemplateRow[] }) {
  const [state, action, pending] = useActionState(sendTest, initial);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div>
      {state.error && (
        <p role="alert" className="mb-3 text-[13px] leading-snug text-[var(--error)]">
          {state.error}
        </p>
      )}
      {state.sent && !state.error && (
        <p role="status" className="mb-3 text-[13px] text-[var(--sage-text)]">
          {state.sent}
        </p>
      )}

      <ul className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
        {templates.map((template) => {
          const expanded = open === template.key;
          const unsendable = template.channels.includes("push") && !template.push;

          return (
            <li key={template.key} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : template.key)}
                  aria-expanded={expanded}
                  className="text-left font-mono text-[13px] text-[var(--text-primary)] underline decoration-[var(--border)] underline-offset-4 hover:decoration-[var(--text-dim)]"
                >
                  {template.key}
                </button>

                <span className="text-[12px] text-[var(--text-dim)]">
                  {template.channels.join(" · ")}
                  {template.optIn.length > 0 && ` (+${template.optIn.join(", ")} opt-in)`}
                  {template.required && " · cannot be declined"}
                  {" · "}
                  {hours(template.ttlHours)}
                </span>
              </div>

              {unsendable && (
                <p className="mt-1 text-[12px] text-[var(--error)]">
                  Routed to push with no §9.4 line — the sweep will skip this
                  <span className="font-mono"> no-copy</span>.
                </p>
              )}

              {expanded && (
                <div className="mt-3 space-y-3 border-l-2 border-[var(--border)] pl-4">
                  {template.push ? (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-dim)]">
                        Push
                      </p>
                      <p className="mt-1 text-[14px] leading-relaxed">{fill(template.push)}</p>
                    </div>
                  ) : (
                    <p className="text-[13px] text-[var(--text-dim)]">
                      §9.4 has no push line for this one.
                    </p>
                  )}

                  {template.sms && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-dim)]">
                        SMS
                      </p>
                      <p className="mt-1 text-[14px] leading-relaxed">{fill(template.sms)}</p>
                    </div>
                  )}

                  {template.tokens.length > 0 && (
                    <p className="text-[12px] text-[var(--text-dim)]">
                      Filled at send time:{" "}
                      <span className="font-mono">{template.tokens.join(", ")}</span> — a missing
                      one drops the whole notification rather than leaving a hole.
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {template.channels.map((channel) => (
                      <form key={channel} action={action}>
                        <input type="hidden" name="template" value={template.key} />
                        <input type="hidden" name="channel" value={channel} />
                        <Button type="submit" disabled={pending}>
                          Test-send to me on {channel}
                        </Button>
                      </form>
                    ))}
                  </div>
                  <p className="text-[12px] leading-relaxed text-[var(--text-dim)]">
                    Queues it against your own account and nobody else&rsquo;s. Delivery is still
                    the sweep&rsquo;s decision, so preferences, quiet hours and whether a transport
                    exists all apply — which is the whole point of testing it this way.
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
