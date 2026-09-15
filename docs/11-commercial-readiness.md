# K. Commercial Readiness

What Karya needs before seriously pursuing new clients and real revenue. This is the **canonical tracker**: update the checkboxes here and commit, so the status is the same on every machine.

Status: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Context (as of 15 Sep 2026)

- Karya is live (Vercel → Neon `production` branch, Singapore) with **one client**, a crochet business (Prishious Knots).
- There are **no new clients or prospects**. Onboarding client #2 is not the current concern.
- The goal is readiness: making Karya something a stranger can safely trust with their business and pay for. Most of the gaps are legal and operational, not features.
- Work from the lowest unfinished phase. Do not build "Deliberately later" items unless priorities change on purpose.
- The legal items are not legal advice. Have a CA or lawyer review them once.

Decisions so far (15 Sep 2026):
- **Current client:** a friend who uses Karya for free and is testing everything. There are no plans to charge her.
- **Employment:** not applicable. This is an unrelated project.
- **Sales approach:** local businesses first, but **self-serve**. A new business enters an email and starts, with no hand-holding required. That makes email verification, forgot-password, signup consent and first-run onboarding (P2.7, P3.1–P3.5) more urgent than originally ranked.
- **First target:** home and handmade sellers, then small shops / retail. Research suggests handmade is the stronger place to start (see `research/2026-09-pricing.md`).
- **Name:** "Karya" is **high risk**. An Indian company already sells SME SaaS as Karya (karya.cloud). See `research/2026-09-name-check.md`.
- **Registration closed (15 Sep 2026):** sign-up is invitation-only (`REGISTRATION` unset = `invite`) until the Group B items are done. Existing members can still start a workspace, which is how a new business gets set up by hand.

## Timing (decided 15 Sep 2026)

| Group | When | Items |
|---|---|---|
| **A: now** | Protects the live client, cheap | Vercel preview env check + P1.6, P1.4, P1.8, P1.9, P1.11, P1.13, P1.2 no-op audit fix, P2.10, P0.2 |
| **B: before any stranger can sign up** | Gate for reopening registration | P1.2 invitation fix, P3.1–P3.4 (blocked by name → domain), P2.1, P2.2, P2.7, P2.9, P3.5, P1.7 |
| **C: before charging anyone** | Gate for the first invoice | P1.5, P1.3 (sooner if the restore drill shows a short window), P2.3–P2.6, P2.8, P2.11, P0.3, P0.5, P0.6, P4.1–P4.5 |
| **D: later / on a trigger** | See each item | P1.10 (second business), **P1.12 (before December 2026)**, P3.6 + P3.7 (after P0.2), P3.8, P3.9, P3.11, P3.10, P0.4 |

The chain that blocks most of B and C: **name → domain → email → verification / forgot password → open sign-up.**

---

## Phase 0: Foundations (no code, do first)

- [x] **P0.1 Employment contract check.** Not applicable: this is an unrelated project (confirmed 15 Sep 2026).
- [ ] **P0.2 Conversation with the current client.** She's a friend using it free, so the goal is learning, not charging:
  - what she uses daily
  - what's still outside Karya
  - what price she'd call fair
  - introductions to similar sellers
  - permission to quote her

  Use `research/client-conversation-guide.md` and record notes there.
- [~] **P0.3 Pricing hypothesis.** First draft in `research/2026-09-pricing.md`: Free (capped orders) / Solo ₹149–199/mo / Team ₹399–499/mo, inside the Indian ₹1,500–4,000/yr band. Still to do: test it in the P0.2 conversation and with the first 2–3 local prospects. **Do not build billing yet.**
- [~] **P0.4 Name / trademark search.** **Parked (15 Sep 2026):** keep "Karya" internally for now and come back when a name comes to mind. Nothing public (domain, landing page, logo) should use "Karya" in the meantime. Rejected directions are listed in `research/2026-09-name-check.md`. Web research is done and the risk is **high** (karya.cloud sells SME SaaS in India under the same name; a KARYAFLOW class 42 filing was made in Ahmedabad in Aug 2026). Next steps:
  - (a) choose a new name
  - (b) run the IP India wordmark and phonetic search (classes 9 / 42 / 35) on the shortlist
  - (c) check domains and social handles
  - (d) rename in code before any public launch
- [~] **P0.5 Business structure.** Not needed while there's no revenue. Trigger: before the first paid invoice, start as a sole proprietorship (PAN, current account in the business name).
- [~] **P0.6 GST decision.** Not needed yet: registration is only mandatory above ₹20 lakh turnover (services). Revisit if a business client asks for a GST invoice.
- [x] **P0.7 Decide the sales approach.** Local first, self-serve signup (email and start). First targets: home / handmade sellers, then small retail.

## Phase 1: Safe to have a second tenant (code and infra, before client #2)

- [x] **P1.1 Cross-tenant isolation tests.** Done 15 Sep 2026: `npm run test:integration` (`src/server/tenant-isolation.integration.test.ts`).
  - **Setup:** two fully seeded workspaces on the Neon dev branch. B's *owner* (so a refusal can only come from tenancy, not permissions) attacks A by id through every server action, the read models, analytics, import, the attachment route and the session/workspace switch. Positive controls prove the fixture is real.
  - **Safety:** refuses the production endpoint and deletes everything it creates.
  - **Result:** 40 tests. The first run **found a real leak**: products, expenses and production lines accepted another workspace's category or payment-method id, and category settings accepted another workspace's parent. The list screens join those tables by id alone, so B would have shown A's labels. Fixed with shared checks in `src/server/domain/ownership.ts`.
  - **Production data:** a read-only query on the dev snapshot found no existing cross-workspace references.
- [~] **P1.2 Check every server action and route for org scoping.** All server actions, `queries.ts`, `analytics.ts`, the attachment route and the pages that query directly were read during P1.1; the client-supplied-id gaps above are fixed. Remaining, lower-risk findings:
  - **Invitations are claimed by email alone** (`claimInvitations` in `domain/members.ts`). With no email verification, anyone who registers with an invited address joins that workspace with the invited role. Inviting an address that already has an account also adds them immediately, without their consent. *Mitigated* while registration is invite-only: only invited addresses can register at all. **Must be fixed before reopening sign-up:** email verification (P3.4) or a single-use invite link.
  - ~~Audit entries on no-op archives.~~ Fixed 15 Sep 2026: archive and remove functions now refuse ids outside the workspace instead of logging a change that didn't happen (covered by the isolation tests).
- [ ] **P1.3 Paid database plan.** Upgrade Neon from free: longer point-in-time restore window, no cold-start sleep.
- [~] **P1.4 Restore drill.** Runbook written: `runbooks/restore-drill.md`. **You:** run the drill once, and record the restore window and results in its table.
- [ ] **P1.5 Vercel Pro.** The Hobby plan is non-commercial. Move before taking money.
- [~] **P1.6 Staging / release flow.** Runbook written: `runbooks/staging-and-releases.md`. **You:** in Vercel, make sure `DATABASE_URL` for **Preview** is the development branch (not production) and Preview has its own `AUTH_SECRET`. Then verify with a throwaway branch.
- [ ] **P1.7 One schema-change workflow.** Use `db:generate` + `db:migrate` for production (the README still says `db:push`). Document how production migrations are applied and rolled back.
- [~] **P1.8 Error tracking.** Sentry wired in (`src/instrumentation.ts`, `src/instrumentation-client.ts`, `app/error.tsx`). Errors only, no personal data, and it does nothing until a DSN is set. **You:** create a free Sentry project (Next.js), then set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` in Vercel (Production and Preview), redeploy, and turn on email alerts. Source-map upload is not set up, so browser stack traces stay minified; add it later if they get hard to read.
- [~] **P1.9 Uptime monitoring.** `/api/health` added (doesn't touch the database, so it won't keep Neon awake). **You:** add a 5-minute HTTP check on `https://<live-url>/api/health` in UptimeRobot or Better Stack, alerting your phone or email.
- [ ] **P1.10 Scheduled reconcile.** Run `db:reconcile` automatically (Vercel cron or a GitHub Action) and alert when it exits non-zero.
- [~] **P1.11 Security pass.** Done 15 Sep 2026:
  - **Dependencies:** Next.js 15.5.23 → **15.5.25**, which fixes a *critical* advisory (remote code execution in the image optimiser); `sharp` patched too.
  - **Image proxy closed:** the config allowed any remote host through the image optimiser, but no component uses `next/image`, so it now allows none.
  - **Headers:** baseline security headers added (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS), and `X-Powered-By` removed.
  - **Upload limits:** already enforced: 4 MB per file, type allowlist, magic-byte check, served sandboxed.

  **Accepted for now:**
  - `postcss` inside Next.js (build-time only, on our own CSS; the fix needs Next 16, a breaking upgrade).
  - Dev-only advisories in vitest / vite / esbuild / drizzle-kit (the critical one needs `vitest --ui`, which isn't used). Upgrade vitest's major version later.

  **Not done:** no per-workspace storage quota; a strict Content-Security-Policy (needs nonces). **You:** confirm Vercel env vars as part of P1.6. Rotate `AUTH_SECRET` and the DB password only if they were ever shared or exposed; the steps are in `runbooks/incident-response.md`.
- [ ] **P1.12 Check the order-number year boundary.** `needsReset` / `renderNumber` in `src/server/domain/numbering.ts` use the server clock (UTC on Vercel), not the org's timezone. Check that an order created 00:00–05:30 IST on 1 January gets the right year, and fix it if not.
- [x] **P1.13 Fix out-of-date docs.** Done 15 Sep 2026:
  - `docs/01` storage row corrected.
  - `DEPLOY.md` path and seed wording fixed, with pointers to the runbooks.
  - `GO-LIVE.md` and `MOVING.md` marked historical.
  - `docs/10` quick reference updated.

  (`.env.example` was already correct; the `s3` mention is only in the local `.env` comment.)

## Phase 2: Trust and compliance (before charging anyone new)

- [ ] **P2.1 Terms of Service.** Cover:
  - limits on liability
  - acceptable use
  - payment, and what happens on non-payment (e.g. read-only mode)
  - termination
  - what happens to data if the service shuts down
  - governing law (India)
- [ ] **P2.2 Privacy Policy.** Cover:
  - what is collected: account data, business data, and clients' customers' personal data
  - purpose
  - where it's stored (Neon Singapore, Vercel)
  - sub-processors
  - retention
  - user rights
  - grievance contact

  Align it with the DPDP Act 2023 and DPDP Rules, and the IT Act SPDI rules.
- [ ] **P2.3 Data-processing terms.** Karya is a *processor* for the customer data clients enter; the client is the data fiduciary. State that Karya uses that data only to provide the service. This can be a clause in the Terms.
- [ ] **P2.4 Refund / Cancellation Policy.** Indian payment gateways require it.
- [ ] **P2.5 Contact Us page.** Real address, phone and email. Gateways check this.
- [ ] **P2.6 Sub-processor list.** Vercel, Neon, Sentry (once its DSN is set; configured to send no personal data), and later the email provider.
- [ ] **P2.7 Consent at signup.** An "I agree to the Terms and Privacy Policy" checkbox, storing the policy version and timestamp.
- [ ] **P2.8 Full workspace export.** One-click download of all org data as a zip of CSV/XLSX plus files: orders, items, payments, customers, products, events, expenses, attachments.
- [ ] **P2.9 Account and workspace deletion.** Owner-initiated workspace deletion with a grace period, user account deletion, and documented backup retention. First check what exists today (`docs/06-permissions.md` mentions workspace deletion).
- [~] **P2.10 Data breach / incident runbook.** Drafted: `runbooks/incident-response.md` (severity levels, containment, secret rotation, signing people out, evidence, DPDP and CERT-In notification). **You:** fill in the contacts table. Confirm the notification duties during the P2.11 legal review.
- [ ] **P2.11 Legal review.** One session with a CA or lawyer covering P2.1–P2.5.

## Phase 3: Usable without the developer in the loop

- [ ] **P3.1 Transactional email.** A provider (Resend / Postmark / SES), with SPF/DKIM/DMARC set up on the domain.
- [ ] **P3.2 Self-service "forgot password".** Emailed reset link, reusing the existing `password_reset_tokens` table. Keep admin reset as a fallback.
- [ ] **P3.3 Email invitations.** Actually send invite emails instead of copy-paste notes.
- [ ] **P3.4 Email verification** at signup.
- [ ] **P3.5 First-run onboarding.** A getting-started checklist (add products → customer → order → payment), plus optional sample data that can be cleared in one click.
- [ ] **P3.6 Mobile audit.** Go through every core flow at phone width and fix friction. Consider a PWA (installable, with an app icon).
- [ ] **P3.7 WhatsApp sharing.** Share an order summary, payment reminder or balance due with the customer via a `wa.me` link with pre-filled text.
- [ ] **P3.8 Help centre.** Short how-to pages and an FAQ, linked from the app.
- [ ] **P3.9 Support channel.** A WhatsApp Business number and a support email, with stated response times.
- [ ] **P3.10 Optional 2FA** for owners and admins.
- [ ] **P3.11 In-app feedback.** A simple "send feedback" link.

## Phase 4: Go-to-market and getting paid

- [ ] **P4.1 Domain and professional email** (after P0.4).
- [ ] **P4.2 Landing page.** Who it's for, screenshots, pricing, a testimonial, links to the legal pages, and a signup button. Put the app on a subdomain (e.g. `app.`).
- [ ] **P4.3 Manual billing for the first 5–10 clients.** An invoice template (GST-compliant if registered), payment by UPI or bank transfer, tracked in a sheet.
- [ ] **P4.4 Light trial and plan enforcement.** A trial end date per org, a banner for the owner, and read-only mode when it expires. A manual toggle is fine at first.
- [ ] **P4.5 Payment gateway** (Razorpay / Cashfree). Only after the Phase 2 pages exist, because gateway KYC requires them.

## Deliberately later (don't build yet)

- Automated subscription billing: wait until manual invoicing becomes painful.
- SOC 2 / ISO 27001 certification.
- GST-compliant invoicing *for clients' customers* (a full tax engine).
- Inventory, suppliers, notifications/automations, AI: only when paying users ask for them.
- Multi-region hosting.
