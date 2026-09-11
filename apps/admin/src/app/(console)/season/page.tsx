import type { Metadata } from "next";
import { Empty, Panel } from "@/components/ui";
import { supabaseServer } from "@/lib/supabase";
import { PhaseForm, SeasonForm, type SeasonRow } from "./forms";

export const metadata: Metadata = { title: "Season" };
export const dynamic = "force-dynamic";

/**
 * The season console — §7.3's second module.
 *
 * Every value a mechanic reads comes from the `seasons` row (§5: "ALL mechanics
 * read config from this row — nothing hardcoded"), and until now the only way
 * to change one was the Supabase dashboard. The drop time, the fuse length, the
 * price of a seat: all editable in a table editor with no audit trail and no
 * explanation of what each one does.
 *
 * The calendar is rendered from the same row rather than stored separately,
 * because a second copy of "when does this season start" is a second thing that
 * can disagree with the first.
 */
export default async function SeasonPage() {
  const supabase = await supabaseServer();

  const { data: seasons } = await supabase
    .from("seasons")
    .select("*")
    .order("starts_at", { ascending: false })
    .limit(20);

  const ids = (seasons ?? []).map((s) => s.id);
  const { data: members } = ids.length
    ? await supabase.from("season_members").select("season_id").in("season_id", ids).limit(10000)
    : { data: [] };

  const counts = new Map<string, number>();
  for (const row of members ?? []) counts.set(row.season_id, (counts.get(row.season_id) ?? 0) + 1);

  if (!seasons?.length) {
    return (
      <div className="mx-auto w-full max-w-[62rem] p-8">
        <h1 className="font-[family-name:var(--font-display)] text-[28px] font-bold tracking-[-0.02em]">
          Season
        </h1>
        <Panel className="mt-6">
          <Empty>
            There is no season row yet. Every mechanic reads its configuration from one, so
            nothing runs until it exists.
          </Empty>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[62rem] space-y-8 p-8">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-[28px] font-bold tracking-[-0.02em]">
          Season
        </h1>
        <p className="mt-1 text-[14px] text-[var(--text-dim)]">
          Every mechanic reads its configuration from here. Changes are audited.
        </p>
      </header>

      {seasons.map((raw) => {
        const season: SeasonRow = { ...raw, members: counts.get(raw.id) ?? 0 };
        const day = (iso: string | null) =>
          iso
            ? new Date(iso).toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric",
              })
            : "—";

        return (
          <section key={season.id} className="space-y-4">
            <Panel
              title={season.name}
              meta={`${season.city} · ${season.phase.replace(/_/g, " ")} · ${season.members}/${season.member_cap}`}
            >
              {/*
                The calendar, from the same row the form edits — §11's timeline
                in the terms this season actually uses.
              */}
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-b border-[var(--border)] px-4 py-3 text-[13px] sm:grid-cols-4">
                {[
                  ["Applications", day(season.applications_open_at)],
                  ["Day one", day(season.starts_at)],
                  ["Finale", day(season.ends_at)],
                  [
                    "Length",
                    `${Math.round(
                      (Date.parse(season.ends_at) - Date.parse(season.starts_at)) / 604_800_000,
                    )} weeks`,
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[var(--text-dim)]">{label}</dt>
                    <dd className="tabular">{value}</dd>
                  </div>
                ))}
              </dl>
              <SeasonForm season={season} />
            </Panel>

            <Panel title="Phase">
              <PhaseForm season={season} />
            </Panel>
          </section>
        );
      })}
    </div>
  );
}
