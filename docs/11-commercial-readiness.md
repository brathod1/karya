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
  - **Invitations are claimed by email alone** (`claimInvitations` in `domain/members.ts`). With no email verification, anyone who registers with an invited address joins that workspace with the invited role. Inviting an address that already has an account also adds them immediately, without their consent. **Must be fixed before open self-serve signup:** email verification (P3.4) or a single-use invite link.
  - **Audit entries on no-op archives.** `archiveCustomer` / `archiveProduct` / `archiveExpense` / `archiveEvent` / `removeCustomerPrice` / `removeProductionItem` write an audit entry even when the id isn't in the workspace. No data changes, but the audit log gains misleading rows. Low.
- [ ] **P1.3 Paid database plan.** Upgrade Neon from free: longer point-in-time restore window, no cold-start sleep.
- [ ] **P1.4 Restore drill.** Restore production as of a past point into a new branch, verify the data, and write the steps into a runbook.
- [ ] **P1.5 Vercel Pro.** The Hobby plan is non-commercial. Move before taking money.
- [ ] **P1.6 Staging / release flow.** Feature branch → Vercel preview deploy (pointed at the dev DB) → merge to `main`. Stop pushing untested work straight to `main`.
- [ ] **P1.7 One schema-change workflow.** Use `db:generate` + `db:migrate` for production (the README still says `db:push`). Document how production migrations are applied and rolled back.
- [ ] **P1.8 Error tracking.** Sentry (or similar) on server and client, with alerts.
- [ ] **P1.9 Uptime monitoring.** An external check of the live URL that alerts by phone or email (e.g. UptimeRobot, Better Stack).
- [ ] **P1.10 Scheduled reconcile.** Run `db:reconcile` automatically (Vercel cron or a GitHub Action) and alert when it exits non-zero.
- [ ] **P1.11 Security pass.**
  - `npm audit` and dependency updates
  - rotate `AUTH_SECRET` and the DB password if they were ever exposed
  - review security headers
  - confirm production env vars
  - check attachment size limits per org
- [ ] **P1.12 Check the order-number year boundary.** `needsReset` / `renderNumber` in `src/server/domain/numbering.ts` use the server clock (UTC on Vercel), not the org's timezone. Check that an order created 00:00–05:30 IST on 1 January gets the right year, and fix it if not.
- [ ] **P1.13 Fix out-of-date docs.**
  - `docs/01-architecture.md` says only the local storage driver exists
  - `.env.example` mentions an `s3` driver that isn't built
  - `DEPLOY.md` / `GO-LIVE.md` refer to `D:\APP` and first-time setup

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
- [ ] **P2.6 Sub-processor list.** Vercel, Neon, and later the email provider and Sentry.
- [ ] **P2.7 Consent at signup.** An "I agree to the Terms and Privacy Policy" checkbox, storing the policy version and timestamp.
- [ ] **P2.8 Full workspace export.** One-click download of all org data as a zip of CSV/XLSX plus files: orders, items, payments, customers, products, events, expenses, attachments.
- [ ] **P2.9 Account and workspace deletion.** Owner-initiated workspace deletion with a grace period, user account deletion, and documented backup retention. First check what exists today (`docs/06-permissions.md` mentions workspace deletion).
- [ ] **P2.10 Data breach / incident runbook.**
  - who to notify, and how fast (DPDP requires notifying the Board and the people affected)
  - how to revoke sessions (`sessionVersion`)
  - how to rotate secrets
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
