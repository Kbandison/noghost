import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/member";
import { loadInbox } from "@/lib/inbox";
import { listChats } from "@/lib/chats";
import { Rail } from "../rail";
import { ConnectDetail } from "./detail";

export const metadata: Metadata = { title: "Note" };
export const dynamic = "force-dynamic";

/**
 * One note, as a whole page.
 *
 * Reached by a refresh, a shared link or a notification — anything that is not
 * a click from the list, which is intercepted into a dialog instead. The detail
 * itself is the same component either way; only the frame differs.
 */
export default async function ConnectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireMember();
  const now = new Date().toISOString();
  const [inbox, chats] = await Promise.all([
    loadInbox(member.id),
    listChats(member.id, now),
  ]);

  return (
    <div className="flex flex-col md:flex-row">
      <div className="hidden md:block">
        <Rail inbox={inbox} chats={chats} now={now} activeId={id} />
      </div>
      <div className="min-w-0 flex-1">

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
        <ConnectDetail id={id} />
      </div>
    </div>
  );
}
