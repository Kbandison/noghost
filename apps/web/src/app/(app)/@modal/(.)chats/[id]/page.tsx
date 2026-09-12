import { ChatDetailView } from "../../../chats/[id]/detail";
import { Modal } from "../../modal";

export const dynamic = "force-dynamic";

/** A conversation, opened over the list. See `(.)inbox/[id]` for the pattern. */
export default async function InterceptedChat({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Modal>
      <ChatDetailView id={id} />
    </Modal>
  );
}
