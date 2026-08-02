import { BRAND } from "@noghost/config";

/** The centred card every unauthenticated screen sits in. */
export function AuthShell({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-[26rem] flex-col justify-center px-6 py-16">
      <p className="mb-10 font-[family-name:var(--font-display)] text-[17px] font-extrabold tracking-[-0.02em]">
        {BRAND.APP_NAME}
        <span className="ml-2 align-middle text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-dim)]">
          Admin
        </span>
      </p>

      <h1 className="font-[family-name:var(--font-display)] text-[28px] font-extrabold leading-[1.1] tracking-[-0.028em]">
        {title}
      </h1>
      {lead && (
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-secondary)]">{lead}</p>
      )}

      <div className="mt-8">{children}</div>

      {footer && <div className="mt-8 text-[13px] leading-relaxed text-[var(--text-dim)]">{footer}</div>}
    </main>
  );
}
