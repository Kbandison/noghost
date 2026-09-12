/**
 * Nothing, which is the normal state of this slot.
 *
 * Without a `default.tsx` an unmatched parallel slot renders a 404 on any hard
 * navigation — so loading /inbox directly, or refreshing it, would 404 the
 * whole page because the modal slot has no match.
 */
export default function NoModal() {
  return null;
}
