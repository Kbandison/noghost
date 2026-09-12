import type { Metadata } from "next";
import { requireMember } from "@/lib/member";
import { loadInbox } from "@/lib/inbox";
import { listChats } from "@/lib/chats";
import { Rail } from "./rail";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

/**
 * Notes and conversations in one place — see `Rail` for why this diverges from
 * §7.2's separate Inbox and Chats tabs.
 */
export default async function InboxPage() {
  const member = await requireMember();
  const now = new Date().toISOString();
  const [inbox, chats] = await Promise.all([
    loadInbox(member.id),
    listChats(member.id, now),
  ]);

  const waiting = inbox.incoming.filter((connect) => connect.status === "pending").length;
  const open = chats.filter((chat) => !chat.state.startsWith("closed")).length;

  return (
    <div className="flex flex-col md:flex-row">
      <Rail inbox={inbox} chats={chats} />

      {/* Hidden on mobile: the rail *is* the screen there, and an empty detail
          pane below a list is just dead space to scroll past. */}
      <div className="hidden flex-1 items-center justify-center p-10 md:flex">
        <p className="max-w-[26rem] text-center text-[16px] leading-relaxed text-[var(--text-dim)]">
          {waiting > 0
            ? "Open a note to read it. You can answer either way — both are real answers."
            : open > 0
              ? "Open a chat. Every one of them is on a seven-day clock — put a real date on the calendar, or close it kindly."
              : "Nothing to answer right now."}
        </p>
      </div>
    </div>
  );
}
