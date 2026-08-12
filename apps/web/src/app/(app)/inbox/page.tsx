import type { Metadata } from "next";
import { requireMember } from "@/lib/member";
import { loadInbox } from "@/lib/inbox";
import { Rail } from "./rail";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const member = await requireMember();
  const inbox = await loadInbox(member.id);

  const waiting = inbox.incoming.filter((connect) => connect.status === "pending").length;

  return (
    <div className="flex flex-col md:flex-row">
      <Rail inbox={inbox} />

      {/* Hidden on mobile: the rail *is* the screen there, and an empty detail
          pane below a list is just dead space to scroll past. */}
      <div className="hidden flex-1 items-center justify-center p-10 md:flex">
        <p className="max-w-[24rem] text-center text-[16px] leading-relaxed text-[var(--text-dim)]">
          {waiting > 0
            ? "Open a note to read it. You can answer either way — both are real answers."
            : "Nothing to answer right now."}
        </p>
      </div>
    </div>
  );
}
