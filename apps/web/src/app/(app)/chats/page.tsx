import type { Metadata } from "next";
import { requireMember } from "@/lib/member";
import { listChats } from "@/lib/chats";
import { Rail } from "./rail";

export const metadata: Metadata = { title: "Chats" };
export const dynamic = "force-dynamic";

export default async function ChatsPage() {
  const member = await requireMember();
  const chats = await listChats(member.id, new Date().toISOString());

  return (
    <div className="flex flex-col md:flex-row">
      <Rail chats={chats} />
      <div className="hidden flex-1 items-center justify-center p-10 md:flex">
        <p className="max-w-[26rem] text-center text-[16px] leading-relaxed text-[var(--text-dim)]">
          {chats.length === 0
            ? "Nothing here yet."
            : "Open a chat. Every one of them is on a seven-day clock — put a real date on the calendar, or close it kindly."}
        </p>
      </div>
    </div>
  );
}
