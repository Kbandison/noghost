/**
 * One icon per tab, drawn rather than pulled from a set.
 *
 * Three of them is fewer than an icon library's own weight, and a library
 * brings a house style with it — these match the product's line weight and the
 * ghost in the wordmark, which a generic set would not.
 *
 * `currentColor` throughout: the active state is a colour on the whole tab, so
 * an icon that carried its own would ignore it.
 */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** A moon: the drop lands at 8pm, and the whole product happens after dark. */
export function TonightIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path {...stroke} d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

/** An envelope, for the notes and conversations behind it. */
export function InboxIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <rect {...stroke} x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path {...stroke} d="m3.8 7.2 7.1 5.2a2 2 0 0 0 2.2 0l7.1-5.2" />
    </svg>
  );
}

/** A person. Settings live behind it, but it is *your* profile first. */
export function ProfileIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <circle {...stroke} cx="12" cy="8.5" r="3.75" />
      <path {...stroke} d="M4.5 19.5a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}
