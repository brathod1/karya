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

Open questions:
- Does the current client pay anything?
- Sales approach: businesses onboarded by hand, or open self-serve signup?
- Has the employment contract been checked?

---

## Phase 0: Foundations (no code, do first)

- [ ] **P0.1 Employment contract check.** Read the IP-assignment, moonlighting and conflict-of-interest clauses, and get written permission if needed. This decides who owns Karya. (`MOVING.md` already raised it.)
- [ ] **P0.2 Validate with the current client.** Ask whether she would pay, how much, and what she'd miss most if Karya disappeared. If the answers are positive, ask for a testimonial.
- [ ] **P0.3 Pricing hypothesis.** Draft plans: trial length, monthly/yearly price, limits (users, storage). Check them against P0.2.
- [ ] **P0.4 Name / trademark search.** "Karya" is a common word and at least one Indian tech company already uses it. Search the IP India trademark registry (classes 9 and 42) before buying a domain or doing any branding.
- [ ] **P0.5 Business structure.** Start as a sole proprietorship (PAN, current account in the business name). Revisit LLP or Pvt Ltd once there is revenue or a partner.
- [ ] **P0.6 GST decision.** Registration becomes mandatory above ₹20 lakh turnover (services). Consider registering voluntarily if business clients need GST invoices.
- [ ] **P0.7 Decide the sales approach.** Businesses onboarded by hand, or open self-serve signup. The answer changes how urgent Phase 3 is.

## Phase 1: Safe to have a second tenant (code and infra, before client #2)

- [ ] **P1.1 Cross-tenant isolation tests.** Integration tests against a real Postgres (Neon dev branch or local). Create org A and org B, then check that B cannot read or change A's:
  - orders, payments, customers, products, events, expenses
  - attachments (`/api/attachments/[id]`)
  - saved views, audit log, CSV exports, import jobs

  Also check that B cannot be invited or switched into A's workspace. All current tests are unit tests; none cover this.
- [ ] **P1.2 Check every server action and route for org scoping.** Each must use `requireOrgContext` / `requireCapability` and `scope()` / `scoped()`, and must check that ids sent by the client belong to the org.
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
