"use client";

import { LEGAL_DOCUMENTS } from "@noghost/config/copy";

/**
 * Read a policy without leaving the application.
 *
 * The last step asks somebody to agree to three documents, and they used to be
 * links to other pages. That is the version where nobody reads them: it asks a
 * person mid-application to leave, find their way back, and trust that their
 * half-finished form survived the trip.
 *
 * They are now the words themselves — "the NoGhost **Terms**, **Privacy
 * Policy**, and **Community Standards**" — each opening in place. A separate
 * "Read them:" line underneath was still a second thing to notice; the sentence
 * somebody is agreeing to is the one place they are certainly looking.
 *
 * ---------------------------------------------------------------------------
 * Why the trigger and the panel are separate components
 * ---------------------------------------------------------------------------
 *
 * The consent text lives inside a `<label>`, and a label forwards clicks to its
 * control. A `<dialog>` rendered next to its own button would therefore sit
 * inside that label — so scrolling the policy, or pressing Close, would toggle
 * the agreement checkbox underneath it.
 *
 * So `PolicyDialogs` renders the three panels once, outside the label, and
 * `PolicyLink` is an inline button that opens one by id. Ids rather than refs
 * because the two ends are in different subtrees and a context for three static
 * documents is more machinery than the problem deserves.
 */

const dialogId = (slug: string) => `policy-dialog-${slug}`;

/** An inline trigger. Must be rendered somewhere `PolicyDialogs` also is. */
export function PolicyLink({ slug, children }: { slug: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        /*
         * Both, and both are needed. `preventDefault` stops the label
         * activating the checkbox; `stopPropagation` stops the click reaching
         * the label at all. Browsers differ on which of the two is sufficient,
         * and a policy link that silently ticks somebody's consent box is the
         * worst possible thing for this particular control to do.
         */
        event.preventDefault();
        event.stopPropagation();
        const dialog = document.getElementById(dialogId(slug));
        if (dialog instanceof HTMLDialogElement) dialog.showModal();
      }}
      className="cursor-pointer text-[var(--accent-text)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--accent)]"
    >
      {children}
    </button>
  );
}

/**
 * The panels. Render once per screen, outside any `<label>`.
 *
 * Native `<dialog>` rather than a div with a z-index: `showModal()` gives focus
 * trapping, Escape, the inert backdrop and the top layer for free — all of
 * which a hand-rolled modal gets wrong, usually by being dismissible only with
 * a mouse.
 */
export function PolicyDialogs() {
  return (
    <>
      {LEGAL_DOCUMENTS.map((doc) => (
        <dialog
          key={doc.slug}
          id={dialogId(doc.slug)}
          // `<dialog>` fires backdrop clicks on itself, so comparing the target
          // to the element distinguishes "the dark area" from "the panel".
          onClick={(event) => {
            if (event.target instanceof HTMLDialogElement) event.target.close();
          }}
          className="m-auto max-h-[85dvh] w-[min(46rem,92vw)] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-primary)] p-0 text-[var(--text-primary)] backdrop:bg-black/50"
        >
          <div className="flex max-h-[85dvh] flex-col">
            <header className="flex items-baseline justify-between gap-4 border-b border-[var(--border)] px-6 py-4">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-[22px] font-bold tracking-[-0.015em]">
                  {doc.title}
                </h2>
                <p className="mt-0.5 text-[13px] text-[var(--text-dim)]">
                  Last updated {doc.updated}
                </p>
              </div>
              {/*
               * A plain button, NOT `<form method="dialog">`.
               *
               * The funnel is one big `<form>`, and a nested form is invalid
               * HTML: the parser drops the inner one, so the server markup and
               * the client tree disagree and hydration fails for the whole
               * step. There is nothing to fall back to anyway — a dialog only
               * ever opens from `showModal()`, so if this component has not
               * hydrated, the panel is not on screen to be closed.
               */}
              <button
                type="button"
                onClick={(event) => event.currentTarget.closest("dialog")?.close()}
                className="shrink-0 cursor-pointer text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4 hover:text-[var(--text-primary)]"
              >
                Close
              </button>
            </header>

            {/* The scrolling region is this div, not the dialog, so the heading
                and the close button stay put while somebody reads. */}
            <div className="overflow-y-auto px-6 py-5">
              <p className="text-[16px] leading-relaxed text-[var(--text-secondary)]">
                {doc.intro}
              </p>

              <div className="mt-7 space-y-7">
                {doc.sections.map((section) => (
                  <section key={section.heading}>
                    <h3 className="font-[family-name:var(--font-display)] text-[17px] font-semibold tracking-[-0.01em]">
                      {section.heading}
                    </h3>
                    <div className="mt-2 space-y-3">
                      {section.body.map((paragraph) => (
                        <p
                          key={paragraph}
                          className="text-[15px] leading-relaxed text-[var(--text-secondary)]"
                        >
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              <p className="mt-8 border-t border-[var(--border)] pt-5 text-[13px] leading-relaxed text-[var(--text-dim)]">
                The same text lives at noghostdating.app/{doc.slug} if you would rather keep a
                copy.
              </p>
            </div>
          </div>
        </dialog>
      ))}
    </>
  );
}

/**
 * A sentence with the document names in it made clickable.
 *
 * Splits on the titles rather than templating them in, so the consent string
 * stays one readable sentence in `@noghost/config/copy` — where legal copy
 * belongs — instead of becoming fragments the code reassembles. If somebody
 * rewords it, the links follow as long as the names survive.
 *
 * Longest title first: "Privacy Policy" has to match before "Privacy" would,
 * or the split leaves a stray " Policy" outside the link.
 */
export function PolicyText({ text }: { text: string }) {
  const titles = [...LEGAL_DOCUMENTS]
    .map((doc) => doc.title)
    .sort((a, b) => b.length - a.length);

  const pattern = new RegExp(`(${titles.map(escapeRegExp).join("|")})`, "g");

  return (
    <>
      {text.split(pattern).map((part, index) => {
        const doc = LEGAL_DOCUMENTS.find((candidate) => candidate.title === part);
        return doc ? (
          <PolicyLink key={`${doc.slug}-${index}`} slug={doc.slug}>
            {part}
          </PolicyLink>
        ) : (
          <span key={index}>{part}</span>
        );
      })}
    </>
  );
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
