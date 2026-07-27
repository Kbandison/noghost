import { Eyebrow, Section } from "@/components/layout/section";

/**
 * Shared shell for the three legal pages.
 *
 * ⚠️ The prose in these pages is drafted, not legally reviewed. Spec §9.8
 * supplies the three consent strings verbatim; the surrounding documents are
 * not in the spec. They must go past a lawyer before launch — a dating app
 * holding selfies and phone numbers is not a place to ship a template.
 */
export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: { heading: string; body: string[] }[];
}) {
  return (
    <Section>
      <Eyebrow className="mb-6">Legal</Eyebrow>
      <h1 className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,5vw,3.5rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
        {title}
      </h1>
      <p className="mt-4 text-[15px] text-[var(--text-dim)]">Last updated {updated}</p>
      <p className="prose-measure mt-8 text-[18px] leading-[1.65] text-[var(--text-secondary)]">
        {intro}
      </p>

      <div className="mt-16 space-y-12">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="font-[family-name:var(--font-display)] text-[22px] font-semibold tracking-[-0.015em]">
              {section.heading}
            </h2>
            <div className="prose-measure mt-4 space-y-4">
              {section.body.map((paragraph) => (
                <p key={paragraph} className="text-[17px] leading-[1.72] text-[var(--text-secondary)]">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Section>
  );
}
