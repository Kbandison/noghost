import { ConnectDetail } from "../../../inbox/[id]/detail";
import { Modal } from "../../modal";

export const dynamic = "force-dynamic";

/**
 * A note, opened over the list instead of under it.
 *
 * `(.)` intercepts `/inbox/[id]` from the same segment level — `@modal` is a
 * slot, not a segment, so the two are siblings. Only a client-side navigation
 * is intercepted: a refresh or a shared link falls through to the real page,
 * which is the behaviour that makes these URLs worth having.
 */
export default async function InterceptedConnect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Modal>
      <ConnectDetail id={id} />
    </Modal>
  );
}
