import { redirect } from "next/navigation";

/**
 * Chats moved into the Inbox.
 *
 * Kept as a redirect rather than deleted: this path is in members' history,
 * in the `noghost://` deep links §7.2 specifies for pushes, and in any
 * notification already sent. A 404 for a link we handed somebody would be our
 * mistake presented as theirs.
 *
 * Individual conversations still live at `/chats/[id]` — only the list moved.
 */
export default function ChatsPage() {
  redirect("/inbox");
}
