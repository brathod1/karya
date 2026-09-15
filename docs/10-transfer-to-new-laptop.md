# Moving Karya development to a new laptop

A complete, ordered checklist for setting up Karya development on a fresh Windows machine and continuing exactly where you left off. Written August 2026, based on the real setup of the current laptop — including every problem that came up and its fix.

---

## 0. What you are moving (and what you are NOT)

Karya's parts live in different places. Only ONE thing needs to be hand-carried; everything else is downloaded or already in the cloud.

| Part | Where it lives | How it gets to the new laptop |
|---|---|---|
| Source code | GitHub: `https://github.com/brathod1/karya` | `git clone` (do NOT copy the folder) |
| Secrets (`.env`) | Only on your laptops — deliberately NOT in git | Copy by hand (see §4) |
| Production database | Neon project **karya-production**, branch `production` (Singapore, endpoint starts `ep-round-smoke`) | Nothing to do — it's in the cloud. **Never point a laptop at it.** |
| Development database | Neon project **karya-production**, branch `development` (endpoint starts `ep-divine-waterfall`) | Nothing to do — get its connection string from the Neon console |
| Deployed app | Vercel, auto-deploys from `main` | Nothing to do |
| Local uploads (`storage/` folder) | Laptop only, gitignored | Copy by hand only if you care about locally stored receipt/product images |
| `node_modules`, `.next` | Laptop only | Do NOT copy — they are regenerated. Copying `.next` between machines caused the "Cannot read properties of undefined (reading 'call')" error last time. |

**Why clone instead of copying the folder:** a copy drags along stale build caches, machine-specific native binaries in `node_modules`, and any uncommitted junk. A clone is guaranteed clean, and your `.env` is the only thing git doesn't carry.

**Before leaving the old laptop:** run `git status` there and commit/push anything uncommitted. Whatever isn't pushed does not transfer.

---

## 1. Install prerequisites

Install these three, in any order. All of them were missing on the last new laptop — downloading is not installing; run each installer to the end.

1. **Node.js 24.x** — https://nodejs.org (Windows installer, default options).
2. **Git for Windows** — https://git-scm.com/download/win (default options).
3. **VS Code** (or your editor) — https://code.visualstudio.com

Then **close every PowerShell/terminal window and open a new one** (PATH changes don't reach already-open windows), and verify:

```powershell
node -v      # should print v24.x
npm -v
git --version
```

### If a command is "not recognized"

The installer's PATH entry didn't land or the window is stale. Find the binary and add it to your user PATH:

```powershell
# Node is usually here:
Test-Path "C:\Program Files\nodejs\node.exe"
# Git is in ONE of these (per-machine vs per-user install):
Test-Path "C:\Program Files\Git\cmd\git.exe"
Test-Path "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe"
```

Permanent fix (adjust the Git path to whichever tested True):

```powershell
[Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path","User") + ";C:\Program Files\nodejs;$env:LOCALAPPDATA\Programs\Git\cmd", "User")
```

Reopen PowerShell and verify again.

### If `npm` errors with "running scripts is disabled"

PowerShell's execution policy is blocking `npm.ps1`. One-time fix:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## 2. Configure git identity

Vercel refuses to deploy commits whose author email it can't match to the GitHub account — this blocked a deployment once already. Use an email that is **verified on the GitHub account** (github.com/settings/emails):

```powershell
git config --global user.name  "Bhishmadevsinh Rathod"
git config --global user.email "<your verified GitHub email>"
```

---

## 3. Clone and install

```powershell
cd <wherever you keep projects>
git clone https://github.com/brathod1/karya.git
cd karya
npm install
```

The first GitHub contact pops up a browser login (Git Credential Manager) — sign in once and it's remembered.

---

## 4. Create `.env` — the only hand-carried file

Copy `.env` from the old laptop (USB, password manager, any private channel — never email/chat it in plain text, and never commit it). Or recreate it from `.env.example`:

```
DATABASE_URL="<development-branch connection string — see below>"
AUTH_SECRET="<same 32+ char secret as the old laptop>"
STORAGE_DRIVER="local"
STORAGE_LOCAL_DIR="./storage"
NODE_ENV="development"
```

**DATABASE_URL must point at the `development` branch**, never production:

1. console.neon.tech → project **karya-production** → **Branches** → `development` → **Connect** → copy the connection string.
2. Sanity check the host before saving: it must contain **`ep-divine-waterfall`** (development). If it contains **`ep-round-smoke`**, that is PRODUCTION with the client's live data — wrong one.

`AUTH_SECRET` should be identical to the old laptop's (sessions are signed with it). If you genuinely can't recover it, any random 32+ character string works — everyone just gets logged out.

If the `development` branch was ever auto-deleted (it was once created with a 1-day expiry by accident), recreate it: karya-production → Branches → Create branch → name `development`, parent `production`, "Branch data and schema", **Auto-delete: Never**.

---

## 5. First run

```powershell
npm run dev
```

Open the URL the terminal prints (usually http://localhost:3000). Log in with an account that exists in the dev branch — the dev branch is a copy of production, so production accounts work; there is no demo/seed account. Better: register a fresh test account at `/register` and do your experimenting in that workspace, keeping the copied client data untouched.

Verify the toolchain while you're at it:

```powershell
npm run typecheck
npm test
```

Both must pass on a clean clone.

### Editor: use the workspace TypeScript

VS Code's built-in TypeScript is newer than the project's and shows phantom errors (e.g. `ts(2882)` on `import "./globals.css"`). Fix once: open any `.ts` file → `Ctrl+Shift+P` → **TypeScript: Select TypeScript Version** → **Use Workspace Version**.

---

## 6. The rules that keep production safe

Production architecture: client → Vercel app → Neon `production` branch. Real business data lives there. The whole setup above exists so your laptop can never touch it by accident.

- The laptop's `.env` points at the `development` branch. All `db:*` scripts (`db:push`, `db:migrate`, `db:seed`, `db:studio`, `db:reconcile`, `setup`) read that `.env`, so they hit dev — which is what makes them safe to run at all. **Check the endpoint in `.env` before running any of them.**
- **Never** paste the production connection string into `.env` "just for a minute".
- `git push origin main` **deploys to the client** via Vercel. Push only tested work. For risky work, use a feature branch — Vercel builds preview deployments for branches without touching production.
- Schema changes: edit `src/server/db/schema.ts` → `npm run db:generate` → `npm run db:migrate` (applies to dev) → test → apply to production as a separate, deliberate, reviewed step. Note the ORM is **Drizzle** (not Prisma).
- One-off SQL against production (repairs, backfills): Neon SQL Editor, and triple-check the **branch selector** — it has defaulted to `production` before. Run on `development` first, always.
- Dev branch drift: the `development` branch is a snapshot. To refresh it with current production data: Neon → Branches → `development` → **Reset from parent**. (Destroys dev-branch changes; never needed in the other direction.)

---

## 7. Things unique to this codebase worth remembering

- **Order numbers** (`ORD-2026-0042`): allocated by `src/server/domain/numbering.ts`, counter table `number_sequences`, per-org, per-year, strictly increasing, **never reused** after deletion/archiving (business decision, Aug 2026). Concurrency-safe via `SELECT ... FOR UPDATE`. The number is a label; the UUID primary key is the identity.
- **Line totals**: `order_items.line_total_minor` is the per-line revenue snapshot that analytics sums. It's computed in `priceItems()` (`src/server/domain/orders.ts`). Historical zeros were backfilled in production in Aug 2026.
- **Deletion model**: archiving (`archivedAt`) is the normal removal — row survives. Permanent deletion exists for mistakes and hard-deletes the row (audit log records it first).
- **All prices** come from `src/server/domain/pricing.ts`. Nothing else may compute a price.
- **Env validation**: `src/server/env.ts` is the only reader of `process.env`; it fails fast with a clear message if `.env` is wrong.
- The dev-only query profiler prints `[perf]` lines per request; it's off in production automatically.
- Project docs live in `docs/01`–`09` (architecture, schema, config, flows, permissions, design system).
- `docs/11-commercial-readiness.md` is the live task tracker for getting ready for paying clients. Update its checkboxes and commit, so every machine sees the same status.

---

## 8. Quick reference

| Task | Command |
|---|---|
| Start dev server | `npm run dev` (add `-- -p 3001` for a specific port) |
| Type check | `npm run typecheck` |
| Tests | `npm test` |
| Apply schema to dev DB | `npm run db:push` (or `db:generate` + `db:migrate`) |
| Inspect dev DB in browser | `npm run db:studio` |
| Deploy to client | `git push origin main` (after testing!) |

**15-minute happy path:** install Node + Git → new terminal → `git clone` → `npm install` → copy `.env` (verify `ep-divine-waterfall`) → `npm run dev` → done.
