import type { Metadata } from "next";
import { Panel } from "@/components/ui";
import { broadcastTargets, recentBroadcasts, templateRows } from "@/lib/comms";
import { BroadcastForm } from "./broadcast-form";
import { TemplateList } from "./template-list";

export const metadata: Metadata = { title: "Comms" };
export const dynamic = "force-dynamic";

/**
 * Comms — spec §7.3's last module.
 *
 * Two halves that look unrelated and are not. The broadcast is the only message
 * in the product whose words are not in §9, and the template list is every
 * message whose words are — put on one screen because the question an admin
 * actually has is "what is this cohort being told", and the answer is both.
 */
export default async function CommsPage() {
  const [seasons, templates, sent] = await Promise.all([
    broadcastTargets(),
    Promise.resolve(templateRows()),
    recentBroadcasts(),
  ]);

  const gaps = templates.filter((t) => t.channels.includes("push") && !t.push).length;

  return (
    <div className="mx-auto w-full max-w-[62rem] space-y-8 p-8">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-[28px] font-bold tracking-[-0.02em]">
          Comms
        </h1>
        <p className="mt-1 text-[14px] text-[var(--text-dim)]">
          Announcements to a cohort, and every notification the product can send.
        </p>
      </header>

      <Panel title="Broadcast">
        <div className="p-4">
          <BroadcastForm seasons={seasons} />
        </div>
      </Panel>

      {sent.length > 0 && (
        <Panel title="Already sent">
          {/*
            Read out of `admin_audit`, not a `broadcasts` table. The audit row
            already records who said what to whom and when, and a second copy of
            that fact is a second thing that can disagree with the first.
          */}
          <ul className="space-y-3 p-4">
            {sent.map((broadcast) => (
              <li key={broadcast.id} className="border-l-2 border-[var(--border)] pl-4">
                <p className="text-[14px] leading-relaxed">{broadcast.body}</p>
                <p className="mt-1 text-[12px] text-[var(--text-dim)]">
                  {new Date(broadcast.at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  · {broadcast.rows} {broadcast.rows === 1 ? "row" : "rows"}
                  {broadcast.email && " · in-app and email"}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel
        title="Every notification in §8"
        meta={
          gaps > 0 ? `${gaps} routed to push with no copy` : `${templates.length} templates`
        }
      >
        <div className="p-4">
          <TemplateList templates={templates} />
        </div>
      </Panel>
    </div>
  );
}
