import Link from "next/link";
import { Ghost } from "@/components/ui/ghost";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
      <Ghost className="mb-8 h-16 w-16 text-[var(--accent)]" title="NoGhost" />
      <h1 className="font-[family-name:var(--font-display)] text-[clamp(2rem,5vw,3rem)] font-extrabold leading-tight tracking-[-0.03em]">
        This one actually did vanish.
      </h1>
      <p className="mt-5 max-w-md text-[17px] leading-relaxed text-[var(--text-secondary)]">
        {/* The second sentence used to be "Everything else on this site ends
            with an explanation, so here's yours" — the product admiring its own
            copy convention at somebody who was looking for a page. */}
        The page isn&rsquo;t here.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <ButtonLink href="/">Back to the start</ButtonLink>
        <Link
          href="/how-it-works"
          className="text-[16px] text-[var(--accent-text)] underline decoration-[1.5px] underline-offset-4 transition-all hover:decoration-[2.5px]"
        >
          How it works
        </Link>
      </div>
    </main>
  );
}
