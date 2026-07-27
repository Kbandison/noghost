# LuxWeb Module: Backend & Platform

> **v1.1 — July 2026.** New module. Covers Supabase (new API keys, Data API grants, MCP), Stripe (version pinning, invoicing, webhooks), Resend + React Email 5 (including Inbound), and the Vercel platform (Fluid compute, BotID, AI Gateway, AI SDK).
> **v1.1.1 — July 2026.** Added Scale & Cost Resilience: the five-layer viral-proofing architecture (page caching, image egress arbitrage, database protection, rate limiting, Realtime/MAU discipline), Supabase Pro risk-surface table, billing posture guidance, and scale anti-patterns 13–20.

> **Read when**: The project includes auth, a database, payments, transactional email, or AI features. This module covers integration patterns and platform gotchas — not schema design or business logic, which are planned per-project.

---

## Environment Variables

Every project with backend features starts with a documented `.env.example`. Never commit real values.

```bash
# --- Supabase (new-style keys — see Supabase section) ---
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxx   # replaces anon key
SUPABASE_SECRET_KEY=sb_secret_xxxx                          # replaces service_role — SERVER ONLY

# --- Stripe ---
STRIPE_SECRET_KEY=sk_live_xxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx

# --- Resend ---
RESEND_API_KEY=re_xxxx

# --- AI (if the project has AI features) ---
ANTHROPIC_API_KEY=sk-ant-xxxx
```

**Rules:**
- Anything without `NEXT_PUBLIC_` never reaches the client bundle. Secret keys, webhook secrets, and AI keys are server-only. Verify with a bundle search before deploy.
- Add real values in the Vercel dashboard, not in committed files.

---

## Supabase

### API Keys (Migration Required on Older Projects)

Supabase replaced the legacy JWT-based keys:

| Legacy | New | Notes |
|--------|-----|-------|
| `anon` key | `sb_publishable_...` | Safe for the browser (RLS still applies) |
| `service_role` key | `sb_secret_...` | Server only. Multiple secret keys can be created and rotated independently. |

New projects no longer ship legacy keys. Older projects should migrate before legacy keys are removed entirely — an unmigrated app breaks at that point. When touching any existing project still on `anon`/`service_role`, flag the migration to the user.

### Client Setup (@supabase/ssr)

Use `@supabase/ssr` — never the plain client in App Router projects:

```bash
npm install @supabase/supabase-js @supabase/ssr
```

```typescript
// src/lib/supabase/client.ts  (browser)
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
```

```typescript
// src/lib/supabase/server.ts  (server components, actions, route handlers)
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}
```

### ⚠️ Data API Exposure Change (Rolling Out Through Oct 2026)

New Supabase projects no longer expose `public` schema tables to the Data API (REST/GraphQL — what `supabase-js` calls) by default. **On October 30, 2026 this applies to ALL existing projects.** Existing tables keep their grants; **new tables created after the rollout return nothing through supabase-js until explicitly granted:**

```sql
-- Required for every new table once the change reaches the project
grant select, insert, update, delete on table public.your_table
  to anon, authenticated;
```

When a Supabase query mysteriously returns empty data on a new table, check grants FIRST. Grants control API visibility; RLS controls row access. You need both.

### Row Level Security (Non-Negotiable)

Every table gets RLS enabled with explicit policies before any client code queries it. No exceptions — the publishable key is public, and RLS is the only thing standing between the internet and the data.

```sql
alter table public.invoices enable row level security;

create policy "Users read own invoices"
  on public.invoices for select
  to authenticated
  using (auth.uid() = user_id);
```

### Supabase MCP Server (Claude Code Integration)

The official remote MCP server lets Claude Code read the schema, run queries, and manage migrations directly — no more pasting schemas into prompts. Add to the project's `.mcp.json`:

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp"
    }
  }
}
```

Scope the connection to the specific project and prefer read-only mode when the task doesn't require writes. Never point an agent with write access at a production database during exploratory work.

---

## Stripe

### Pin the API Version

Stripe uses date-named releases (`...acacia` → `...basil` → `...dahlia`). Always pin explicitly — never rely on the account default:

```typescript
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-06-24.dahlia",
});
```

### Which Product for Which Job

| Need | Use |
|------|-----|
| One-off service payment (client projects) | Checkout Session or Payment Link |
| Recurring Care Plan billing | Subscriptions via Checkout |
| CRM invoicing with due dates | Stripe Invoicing — invoices can now be **scheduled to charge or send on a specific date** (fits installment structures like monthly project payments) |
| E-commerce | Checkout + webhooks for fulfillment |

### Webhook Handler (The Standard Pattern)

Every Stripe integration verifies signatures and handles events idempotently:

```typescript
// src/app/api/webhooks/stripe/route.ts
import { stripe } from "@/lib/stripe";
import { headers } from "next/headers";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = (await headers()).get("stripe-signature")!;

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  // Idempotency: record event.id, skip if already processed
  switch (event.type) {
    case "checkout.session.completed":
      // fulfill
      break;
    case "invoice.paid":
      // mark paid in CRM
      break;
  }

  return new Response(null, { status: 200 });
}
```

**Rules:** money is always integer cents, never floats. Test with Stripe test clocks before shipping subscription logic. Unhandled event types return 200, not errors.

---

## Resend + React Email 5

### Sending (Server Action Pattern)

```bash
npm install resend @react-email/components
```

```tsx
// src/emails/contact-notification.tsx — React Email 5 component
import { Html, Container, Heading, Text, Hr } from "@react-email/components";

export function ContactNotification({ name, message }: { name: string; message: string }) {
  return (
    <Html>
      <Container style={{ fontFamily: "sans-serif", padding: "24px" }}>
        <Heading as="h2">New inquiry from {name}</Heading>
        <Hr />
        <Text>{message}</Text>
      </Container>
    </Html>
  );
}
```

```typescript
// inside a Server Action
import { Resend } from "resend";
import { ContactNotification } from "@/emails/contact-notification";

const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: "LuxWeb <hello@notifications.luxwebstudio.dev>",
  to: ["kevin@luxwebstudio.dev"],
  subject: `New inquiry from ${name}`,
  react: ContactNotification({ name, message }),
});
```

Emails are React components in `src/emails/` — never hand-built HTML strings. Pass an idempotency key when a retry could double-send (payment receipts, invoices).

### Inbound Email (New — CRM-Grade Feature)

Resend can now RECEIVE email: it parses incoming messages to JSON, stores attachments, and POSTs a payload to your endpoint. Use case: client replies land inside the CRM's messaging thread instead of a personal inbox. Setup: MX record on the receiving subdomain → webhook endpoint → handle `email.received` events. Bodies/attachments are fetched via the Received Emails API; treat all inbound content as untrusted input.

### Deliverability (Not Optional)

SPF, DKIM, and DMARC records are required — Gmail and Yahoo enforce them. Verify the sending domain in Resend before launch and send from a subdomain (`notifications.clientdomain.com`) to protect the root domain's reputation.

---

## Vercel Platform

### Fluid Compute + Active CPU (Default)

Fluid compute is the default for new projects: multiple invocations share instances, and Active CPU pricing bills only actual execution time — an AI call that waits 30s on the model but computes for 300ms bills for 300ms. Practical effect: AI features on client sites are cheap. No configuration needed; just don't disable it.

### BotID (Put It on Every Form)

Invisible bot protection (no CAPTCHAs, no user friction) for the routes bots actually attack: contact forms, login/signup, checkouts, and any endpoint that triggers an LLM call. Install the `botid` package, mount the client component on protected pages, verify server-side in the route/action before doing the expensive work. Every client-site contact form and every CRM login gets this — it's the difference between a clean inbox and a spam-filled one.

### AI Gateway (Model Resilience)

One endpoint for ~100 models across providers with automatic failover and per-model cost/latency observability. With the AI SDK, switching or falling back between models is a string change. Use it when an AI feature is production-critical and a single-provider outage would break it.

### Analytics + Speed Insights

Both are one-package installs (`@vercel/analytics`, `@vercel/speed-insights`) — add the components to the root layout on every deployed project. Real-user performance data is how Phase 6's Lighthouse targets get verified in production.

---

## AI Features (Vercel AI SDK)

The standard for streaming AI in this stack:

```bash
npm install ai @ai-sdk/react @ai-sdk/anthropic zod
```

```typescript
// src/app/api/chat/route.ts
import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: "You are the assistant for [project].",
    messages,
  });

  return result.toUIMessageStreamResponse();
}
```

Client side uses `useChat` from `@ai-sdk/react` — see `APP.md → AI Interface Patterns` for the UI rules (streaming display, stop button, suggested prompts). Structured output uses Zod schemas so AI responses get the same type safety as the rest of the app. Protect every AI endpoint with BotID or rate limiting — token costs make these the most expensive routes to leave open.

---

## Scale & Cost Resilience (Viral-Proofing)

> **The principle: Supabase is the source of truth, never the delivery layer.** Viral traffic hits Vercel's CDN and cache; Supabase sees only writes, personalized reads, and cache fills. Built this way, a traffic spike costs dollars — not an outage.

### The Risk Surface (Supabase Pro)

| Quota (Pro) | Included | What burns it |
|-------------|----------|---------------|
| **Egress** | 250 GB/mo | **The #1 viral killer.** Files served straight from Storage. 2 MB of images per view × 125K views = the entire month in one day. |
| Auth MAU | 100K | $0.00325/user after. Anonymous sign-ins count. 500K MAU ≈ $1,300/mo in auth alone. |
| Database | 8 GB + micro compute ($10 credit) | Unindexed queries, per-row RLS evaluation, exact counts on hot pages |
| Realtime | 500 concurrent connections | Realtime subscriptions on public pages |
| Edge Functions | ~2M invocations | Functions doing work that should be static or cached |
| Storage | 100 GB | Uncompressed originals that never get resized |

### Layer 1 — Page Caching: Public Content Never Queries Per-Visitor

Marketing and content pages are static/ISR — a viral page is a CDN hit, not a query. Public dynamic data (listings, counters, testimonials) uses cached reads with revalidation:

```typescript
import { unstable_cache } from "next/cache";
// Next 16: prefer the "use cache" directive where the project has it enabled

export const getPublicListings = unstable_cache(
  async () => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("listings")
      .select("id,title,price,cover_url")     // never select *
      .order("created_at", { ascending: false })
      .range(0, 23);
    return data;
  },
  ["public-listings"],
  { revalidate: 60, tags: ["listings"] }      // 100K visitors/min → 1 query/min
);
// After a write that changes the list: revalidateTag("listings")
```

**The rule:** live queries are reserved for writes and personalized reads. If a query returns identical data for two anonymous visitors, it MUST be cached.

### Layer 2 — Images: The Egress Arbitrage

Never hot-link Supabase Storage URLs in `<img>` or CSS. Every image routes through `next/image`:

- Vercel bills transformations only on cache MISS ($0.05/1K); repeat views are cheap CDN cache hits ($0.40/1M reads). Supabase pays egress roughly **once per variant per cache window** — Vercel's cache absorbs the viral traffic.
- Upload with a long cache header (the default is 1 hour — useless for immutable assets):

```typescript
await supabase.storage.from("public-assets").upload(path, file, {
  cacheControl: "31536000",   // 1 year — immutable public assets only
  contentType: file.type,
});
```

- Compress client-side before upload (canvas resize or `browser-image-compression`) — cuts storage AND all future egress at the source.
- In `next.config.ts`: allowlist `images.remotePatterns` to the project's storage host and set `images.qualities: [75]` to cap transformation variants.

**Escalation path (media-heavy / UGC projects):** public assets move to **Cloudflare R2 — zero egress fees** — the egress problem ceases to exist. Supabase Storage stays for private, RLS-gated files. **Video never ships from Supabase Storage:** Mux or Cloudflare Stream for owned video; YouTube/Vimeo embeds (via `@next/third-parties`) for everything else.

### Layer 3 — Database Protection

- Serverless connects through the **transaction-mode pooler** (port 6543) — never direct connections from functions.
- Public pages use estimated counts, never exact:

```typescript
const { count } = await supabase
  .from("posts")
  .select("*", { count: "estimated", head: true });
```

- Named columns only, paginate with `.range()`, no unbounded queries.
- **RLS performance** (the hidden CPU eater): index every column used in a policy, and wrap auth functions so they evaluate once per statement instead of once per row:

```sql
create policy "own rows" on public.invoices for select
  to authenticated
  using ((select auth.uid()) = user_id);  -- (select ...) caches per-statement

create index idx_invoices_user_id on public.invoices (user_id);
```

- Expensive aggregates become materialized views refreshed on a schedule — never computed per-request.
- Run the dashboard **Index Advisor** before launch and after adding any hot query.

### Layer 4 — Rate Limiting: Bots Spend Quota Too

BotID (already required) blocks automation; rate limiting caps everyone. Protect AI endpoints, auth flows, search, and write routes:

```bash
npm install @upstash/ratelimit @upstash/redis   # Vercel Marketplace → Upstash, free tier
```

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "10 s"),
});

// Top of a route handler or Server Action:
const { success } = await ratelimit.limit(userId ?? ip);
if (!success) return new Response("Slow down", { status: 429 });
```

An unprotected endpoint being hammered by a scraper burns egress, compute, and AI tokens exactly like real users — at bot speed.

### Layer 5 — Realtime & MAU Discipline

- 500 concurrent connections is the scarcest number on the plan. Realtime NEVER runs on public pages — public "live" elements poll a cached endpoint (Layer 1) every 15–30 seconds instead.
- Reserve Realtime for authenticated app surfaces, and prefer **Broadcast** channels over `postgres_changes` (no per-message database and RLS overhead).
- Auth sessions are created at the moment of intent, never on browse. No casual anonymous sign-ins — each one is a billable MAU.

### Billing Posture (Pro)

- **Spend cap OFF + usage alerts at ~70%.** Cap ON means Supabase hard-stops the project when a limit is hit — downtime mid-viral-moment, which defeats everything above. With the five layers in place, overages stay in the tens of dollars; staying up during the one moment that matters is worth it. This is a per-org decision the user confirms — never assume.
- Weekly habit: the usage page, egress first. An egress spike almost always means a missing cache header or a hot-linked asset.
- If a launch or press moment is scheduled: upgrade the compute add-on the day before. It scales independently and downgrades after.

---

## Backend Anti-Patterns — NEVER Do These

1. ❌ Secret keys (`sb_secret_`, `sk_live_`, `re_`, `sk-ant-`) anywhere in client code or `NEXT_PUBLIC_` vars
2. ❌ A table without RLS enabled + explicit policies
3. ❌ Assuming a new table is API-visible — post-Oct-2026, grants are explicit (check grants before debugging "empty data")
4. ❌ Webhook handlers without signature verification
5. ❌ Payment or email mutations without idempotency handling
6. ❌ Money stored or computed as floats — integer cents only
7. ❌ Unpinned Stripe API version
8. ❌ Hand-built HTML email strings instead of React Email components
9. ❌ Sending from the root domain instead of a subdomain
10. ❌ AI endpoints without bot protection or rate limiting
11. ❌ Legacy `anon`/`service_role` keys in new code
12. ❌ Giving an AI agent (MCP) write access to production data during exploratory work
13. ❌ Supabase Storage URLs hot-linked in `<img>`/CSS — every image routes through next/image or a CDN
14. ❌ Per-visitor queries on public pages — identical-for-everyone data must be cached
15. ❌ Exact `count` on public/hot pages — `count: "estimated"` only
16. ❌ Realtime subscriptions on public pages
17. ❌ Anonymous sign-ins for browsing — each one is a billable MAU
18. ❌ Video delivered from Supabase Storage
19. ❌ Serverless functions on direct DB connections — transaction pooler only
20. ❌ Spend cap posture (on/off) left as an accident instead of a conscious decision with alerts configured

---

*Backend architecture (schemas, business logic, multi-tenancy) is planned per-project in discovery — this module covers the integration layer so every project wires the same services the same correct way.*
