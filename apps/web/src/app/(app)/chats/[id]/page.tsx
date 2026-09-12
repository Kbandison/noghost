import type { Metadata } from "next";
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
      <Rail inbox={inbox} chats={chats} now={now} activeId={id} />
      <ChatDetailView id={id} />
    </div>
  );
}
