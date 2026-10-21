# Rent & Electricity Manager

A production-ready web app for managing rent, TGNPDCL electricity bills, payments,
outstanding dues and monthly WhatsApp reminders for a small rental property in
Telangana, India.

- **Stack:** React 19 + TypeScript + Vite, Tailwind CSS 4, Supabase (Postgres + Auth)
- **Hosting:** Cloudflare Pages (static SPA)
- **Currency:** INR (₹) · **Timezone:** `Asia/Kolkata`
- **WhatsApp:** click-to-chat / share links only — no Business API, no paid services

## Quick start (no setup needed)

```bash
npm install
npm run dev
```

With no Supabase environment variables the app runs in **DEMO MODE**: a permanent
amber banner explains that all data is fictional, in-memory sample data. This is
the fastest way to click through the whole workflow.

```bash
npm run lint      # oxlint
npm run typecheck # tsc
npm test          # vitest (59 tests)
npm run build     # production build → dist/
```

## Pages

| Page | What it does |
| --- | --- |
| **Dashboard** | Rent expected, electricity charged, payments received, outstanding dues, unpaid/partial lists, recent bills & payments, quick actions |
| **Tenants** | Name, room, phone (optional), monthly rent, move-in date, active/inactive |
| **Electricity Meters** | Meter code (M1–M6…), TGNPDCL USC, room, tenant mapping with allocation weights, individual/shared/multi-per-tenant arrangements, **View Official Bill** |
| **Electricity Bills** | One bill per meter per month (DB-enforced), verification workflow, "apply charges to tenants", source recorded as manual vs official-lookup |
| **Monthly Statements** | Per-tenant statement with full calculation breakdown, charge ledger, WhatsApp reminder actions |
| **Payments** | Record payments (FIFO allocation shown per charge), other charges and credits |
| **Reminder History** | Every prepared/marked-sent reminder with the exact message text |
| **Settings** | Connection status, JSON backup, audit trail, explanation of the balance rules |

## Supabase setup

### 1. Create a project

Create a project at [supabase.com](https://supabase.com) — the free tier is enough.

### 2. Apply the migrations

**Option A — Supabase SQL editor (simplest):** run in order

1. `supabase/migrations/0001_initial_schema.sql`
2. `supabase/migrations/0002_rls_policies.sql`

**Option B — Supabase CLI:**

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Both migrations are idempotent (safe to re-run). They create the tables, enums,
indexes, unique constraints, RLS policies and the two RPCs (`is_admin`,
`ensure_rent_charges`, `record_payment_with_allocations`).

### 3. Create the administrator account

1. Supabase → **Authentication → Users → Add user** → email + password, tick
   "Auto confirm user".
2. Copy the user's UUID.
3. SQL editor:

```sql
insert into public.admins (user_id) values ('<the-user-uuid>');
```

Every RLS policy requires a row in `admins`. Anonymous visitors can read
**nothing** — no tenant names, phone numbers, amounts or statements.

> Tip: disable public sign-ups (Authentication → Providers → Email → turn off
> "Enable sign ups") so only accounts you create can exist.

### 4. Environment variables

```bash
cp .env.example .env.local
```

Fill in from **Project Settings → API**:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon or publishable key>
```

Only the publishable/anon key goes in the browser. Never put the `service_role`
key in any `VITE_*` variable — it would ship to every visitor. `.env*` files are
git-ignored.

### 5. (Optional) development seed

`supabase/seed.dev.sql` contains clearly fictional sample tenants/meters/bills.
Run it **only** in a scratch project or local stack (`supabase db reset`), never
in production. Demo mode is the preferred way to try things out.

## How the money maths works

All amounts are stored as `numeric(14,2)` in Postgres and carried in the browser
as **integer paise** (`src/lib/money.ts`). Floating point is never used for totals.

```
outstanding(month) = Σ charges dated ≤ month  −  Σ payments received by then
previous dues      = Σ charges dated < month  −  Σ payments received before the month
```

- **Payment allocation is FIFO** — each payment clears the oldest unpaid charge
  first (by charge date, then creation time). Allocations are persisted in
  `payment_allocations` so every rupee can be traced to a charge.
- An **overpayment** is never lost: it appears as a credit on the balance.
- **Credit charges** (discounts) are stored as negative amounts and reduce the
  balance directly.
- **Shared meters** are split by integer allocation weights using the
  largest-remainder method, so the parts always add back to the bill exactly
  (`splitAmountByWeights`, unit-tested).
- **Rent charges** are generated idempotently per active tenant when you open a
  billing month; switching months never duplicates them.
- Statements are **derived** from the ledger rather than stored as a second copy
  of the numbers. The suggested `monthly_statements` / `statement_items` tables
  were deliberately dropped: materialised statement rows drift from the ledger
  whenever a bill is corrected or a payment is deleted. The audit trail
  (`audit_logs`) plus the immutable charge/payment rows preserve the same history
  without a consistency hazard. This is the one schema deviation from the brief,
  and it is deliberate.

Everything above is unit-tested in `tests/ledger.test.ts`.

## Electricity bills — manual verification workflow

TGNPDCL does **not** publish a free authorised bill-enquiry API for LT consumers,
and no eligible BBPS integration is connected here. The app therefore **never
claims to fetch bills automatically**, does not scrape the provider site and does
not bypass CAPTCHA.

The working loop:

1. **Electricity Meters → View official bill** (or **Bills → Official bill**)
   opens the official page in a new tab:
   <https://tgnpdcl.com/Menu/KnowYourBillLT>
2. Enter the USC shown in the app on that page.
3. Compare the consumer name, month and amount.
4. **Bills → + Add bill** → pick meter, month, amount, dates. The source field
   records whether you cross-checked the official page or are entering from a
   paper bill. The bill is saved as **Needs verification**.
5. **Verify & apply** — marks it verified and creates the per-tenant electricity
   charges (split by allocation weights). Applying twice creates nothing new.

The USC is **not** appended as a URL parameter: the official page documents no
supported way to pre-fill it, and inventing parameters would silently break.

Bill retrieval sits behind a provider adapter (`src/lib/bill-provider/`). A real,
tested integration can be added there later without touching the rest of the app.

## WhatsApp reminders

No WhatsApp Business API is used and **nothing is ever sent automatically**.

| Action | How it works |
| --- | --- |
| **Send via WhatsApp — Choose Contact** | Opens `https://api.whatsapp.com/send?text=<encoded>` — WhatsApp opens with the text prefilled and *you* pick the recipient. Recipient-selection support varies between the WhatsApp mobile app, desktop app and WhatsApp Web. |
| **Send to saved number** | Opens `https://wa.me/91XXXXXXXXXX?text=<encoded>` for a validated Indian mobile number (10 digits starting 6–9; `+91`/`0` prefixes normalised). Shown only when a valid number is saved. |
| **Copy message** | Clipboard fallback (with `execCommand` fallback for older browsers) when WhatsApp cannot be opened. |
| **Mark as sent** | Records *your* statement that you sent it. The app never claims delivery or read status — clicking a link proves nothing. |

Messages are generated from live statement data (`buildReminderMessage`), never
from hardcoded amounts, and a fully paid statement says so with ₹0.00
outstanding. Reminder logs store the exact text so you can re-check what was sent.

## Deploy to Cloudflare Pages

### Via GitHub (recommended)

1. Push this repository to GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Build settings:
   - **Framework preset:** Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. **Settings → Environment variables** (Production *and* Preview):
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Deploy.

SPA routing is handled by `public/_redirects` (`/* /index.html 200`), which is
copied into `dist` at build time — direct hits on `/statements` etc. work.

### Deployment verification checklist

- [ ] Build succeeds (`npm run build` locally and on Cloudflare).
- [ ] Site loads over HTTPS; the login page appears (a DEMO banner instead means
      the env vars are missing — that is your signal).
- [ ] Deep link test: open `https://<your-domain>/statements` directly.
- [ ] Sign in; the dashboard shows **0 tenants** on a fresh database.
- [ ] Add one tenant, one meter, one bill; verify & apply; check the statement.
- [ ] Record a partial payment and confirm the outstanding figure.
- [ ] Click a WhatsApp action and confirm WhatsApp opens with the right text.
- [ ] Sign out, then confirm a private/incognito window cannot reach `/tenants`.

### Future server-side bill fetching

If a verified TGNPDCL/BBPS integration becomes available, use a **Cloudflare
Worker** (Pages Functions is the same runtime wrapped for this project). Call the
provider from the server with a secret key; the browser only ever talks to your
own endpoint. That stays inside the free tier for a single-admin app — no extra
paid infrastructure. The provider adapter interface is already in place.

## Security notes

- RLS is enabled on every table; all policies require a row in `public.admins`.
- `anon` has no table grants at all; RPCs are revoked from `anon`/`public` and
  granted to `authenticated` only, with an `is_admin()` check inside each body.
- The service-role key is never referenced in frontend code.
- Phone numbers and financial records are only readable through an authenticated
  admin session.
- Deleting financial records is confirmation-gated and blocked when history would
  become inconsistent (a tenant with charges, a bill with allocated payments).

## Testing — what is and is not covered

**Automated (59 tests, `npm test`):** money parsing/formatting, Asia/Kolkata date
handling, Indian phone normalisation, WhatsApp link building and URL encoding, the
FIFO allocation engine, statement maths (previous dues, partial payments, full
payment, credits, no double-counting), shared-meter weight splitting, demo-store
guards (duplicate bills, idempotent rent charges, delete protection), and a smoke
test that renders the full app in demo mode.

**Not automated — verify manually against a real Supabase project:**

- The SQL RPCs and RLS policies (they only run on real Postgres). Apply the
  migrations to a scratch project and exercise: sign in as admin, add a tenant,
  add a bill, verify & apply, record a partial payment, confirm a second
  browser/incognito session with no session cannot read any table.
- WhatsApp link behaviour on real devices (mobile app vs desktop app vs web) —
  the URL formats are tested, the hand-off to the WhatsApp application is not.

## What is not implemented (honest list)

- **Automatic bill fetching.** No authorised, free TGNPDCL API exists for LT
  consumers and no BBPS provider integration is wired up, so the manual
  verification workflow above is the supported path. The adapter interface
  (`src/lib/bill-provider/`) is the single place to add one later.
- **Scheduled/automatic reminders.** Reminders are prepared and sent by you in
  WhatsApp; nothing runs on a timer and no paid messaging service is required or
  used.
- **Tenant self-service portal.** Single-admin app by design; tenants never log in.
- **Multi-property support.** One property per deployment (adding a property
  selector later is straightforward — rooms/meters already carry labels).
- **Receipt file storage.** The bill form stores a receipt *URL*; upload storage
  (e.g. Supabase Storage) is not wired up.

## Project layout

```
supabase/migrations/   SQL schema + RLS (apply in order)
supabase/seed.dev.sql  fictional dev data — never run in production
src/lib/               pure logic: money, dates, ledger, phone, WhatsApp, adapters
src/data/              storage contract + Supabase and demo implementations
src/app/               providers (auth, month, toast), workspace hook
src/components/        UI kit + layout + reminder panel
src/pages/             the eight application pages
tests/                 vitest suites
```
