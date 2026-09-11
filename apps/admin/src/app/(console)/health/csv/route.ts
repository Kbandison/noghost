import { metricsToCsv } from "@noghost/logic";
import { requireAdmin } from "@/lib/auth";
import { cohortReport } from "@/lib/cohort-health";
import { supabaseServer } from "@/lib/supabase";

/**
 * §7.3's CSV export.
 *
 * `requireAdmin()` runs here as well as in the layout, because a route handler
 * is not a page — it is reachable directly with a session cookie and nothing
 * else, and this one returns a season's whole operating history.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const seasonId = url.searchParams.get("season");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!seasonId || !from || !to) return new Response("Missing season, from or to", { status: 400 });

  const supabase = await supabaseServer();
  const { data: season } = await supabase
    .from("seasons").select("name,timezone").eq("id", seasonId).maybeSingle();
  if (!season) return new Response("No such season", { status: 404 });

  const report = await cohortReport(seasonId, season.timezone, from, to);
  const slug = season.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return new Response(metricsToCsv(report.days), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-${from}-to-${to}.csv"`,
      // A cohort's operating history is not something to leave in a CDN.
      "cache-control": "no-store",
    },
  });
}
