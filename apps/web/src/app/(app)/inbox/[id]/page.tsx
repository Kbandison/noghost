import type { Metadata } from "next";
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
      <Rail inbox={inbox} chats={chats} now={now} activeId={id} />
      <div className="min-w-0 flex-1">
        <ConnectDetail id={id} />
      </div>
    </div>
  );
}
