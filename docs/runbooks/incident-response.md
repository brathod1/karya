# Incident response (P2.10)

What to do when something goes seriously wrong. Written in advance, while calm. This is not legal advice; confirm the notification duties with a lawyer or CA when it matters.

## Recognise it

| Severity | Examples | Respond |
|---|---|---|
| **S1: data exposure** | One workspace can see another's data; a database string, `AUTH_SECRET` or a GitHub/Vercel/Neon login leaked; unknown sign-ins | Immediately |
| **S2: outage or data loss** | Site down; data deleted or corrupted | Within the hour |
| **S3: wrong results** | Balances or totals wrong; `db:reconcile` reports drift | Same day |

## First hour: contain

Keep a timeline as you go (times, what you saw, what you did). You will need it.

**If a release caused it:** Vercel → Deployments → last good deployment → **Instant Rollback**.

**If data is exposed between workspaces:** roll back. If there's no safe version to roll back to, temporarily take the app offline, for example by pointing production at a maintenance page, or pausing the project in Vercel.

**If a secret leaked, rotate it:**

| Secret | How to rotate | Side effect |
|---|---|---|
| `AUTH_SECRET` | New value (`node -e "console.log(require('crypto').randomBytes(36).toString('base64'))"`) → Vercel env → redeploy → password manager | Everyone is signed out |
| Database password | Neon → project → **Roles** → reset the password → new connection string into Vercel (Production), then redeploy; update your password manager | Old string stops working |
| GitHub / Vercel / Neon account | Change password, sign out other sessions, review access tokens and connected apps; turn on two-factor if it's off | — |
| Sentry DSN | Not a secret (it's public in the browser), but can be rotated in Sentry → Client Keys if abused | — |

**Sign one person out everywhere** (for example a compromised account). Use Neon SQL Editor on production and **check the branch selector**:

```sql
update users set session_version = session_version + 1 where lower(email) = lower('person@example.com');
```

## Preserve evidence

Don't delete anything while investigating:
- **Vercel:** Logs for the period (export them if your plan's retention is short).
- **Sentry:** the errors and their timestamps.
- **The app's audit log:** `audit_logs` table, or Settings → Audit log in each affected workspace.
- **Neon:** create a branch *now* to freeze the current state before any repair.

## Tell people

**The client first, and promptly.** Say what happened, what data was involved, what you've done, and what they should do. Karya processes their customers' personal data on their behalf, so they may have their own obligations and need to hear it from you quickly.

**Legal duties in India (confirm with a professional):**
- **DPDP Act 2023 / DPDP Rules:** a personal data breach must be reported to the **Data Protection Board of India** and to each affected person. The Rules require an initial intimation without delay and a detailed report within **72 hours**.
- **CERT-In directions (2022):** certain cyber incidents must be reported to CERT-In within **6 hours** of noticing them. Check whether they apply to this service.

## Afterwards

1. Write a short note in `docs/incidents/YYYY-MM-DD-short-name.md`: timeline, cause, impact, what fixed it, what prevents a repeat.
2. Add a test that would have caught it (see `src/server/tenant-isolation.integration.test.ts` for the pattern).
3. Update this runbook with whatever was missing.

## Contacts (fill in)

| Who | How |
|---|---|
| Client (workspace owner) | |
| Neon support | console.neon.tech → Support |
| Vercel support | vercel.com/help |
| Lawyer / CA | |
| CERT-In | incident@cert-in.org.in (check cert-in.org.in for current reporting details) |
