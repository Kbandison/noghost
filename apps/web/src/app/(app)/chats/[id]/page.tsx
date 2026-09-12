import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/member";
import { listChats } from "@/lib/chats";
import { loadInbox } from "@/lib/inbox";
import { Rail } from "../../inbox/rail";
import { ChatDetailView } from "./detail";

export const metadata: Metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

/**
 * One conversation, as a whole page.
 *
 * Reached by a refresh, a shared link or a push — anything that is not a click
 * from the list, which is intercepted into a dialog instead.
 */
export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireMember();
  const now = new Date().toISOString();
  const [chats, inbox] = await Promise.all([
    listChats(member.id, now),
    loadInbox(member.id),
  ]);

  return (
    <div className="flex flex-col md:flex-row">
      <div className="hidden md:block">
        <Rail inbox={inbox} chats={chats} now={now} activeId={id} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">

      {/*
        * Mobile shows the detail ALONE, with a way back — never the list with
        * the detail stacked under it.
        *
        * A click from the Inbox is intercepted into a dialog, so this page is
        * what a refresh, a shared link or a push notification lands on. Those
        * used to render the rail and then the note below it, which on a phone
        * meant a screenful of other people's rows above the thing you opened —
        * the exact complaint the dialog was meant to fix, arriving by the one
        * route the dialog does not cover.
        */}
      <div className="border-b border-[var(--border-subtle)] px-5 py-3 md:hidden">
        <Link
          href="/inbox"
          className="text-[15px] text-[var(--accent-text)] underline decoration-[1.5px] underline-offset-4"
        >
          &larr; Inbox
        </Link>
      </div>
        <ChatDetailView id={id} />
      </div>
    </div>
  );
}
