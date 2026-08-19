# Getting this off the company laptop

Right now this project exists in exactly one place — `D:\APP` on a machine that belongs to your employer. If that laptop is reimaged, reclaimed, or you simply hand it back, the code is gone. The database is not: Neon is already in the cloud, so your data survives regardless. But the code doesn't, and the accounts might.

Three things to sort, in this order.

---

## 0. Before anything: which accounts is this under?

Check what email you used for **Neon**, and use the same rule for GitHub and Vercel:

- **Personal email → good.** Nothing to do.
- **Work email → change it now, while it's cheap.** A work account disappears the day you leave, taking the project with it. Neon: Account settings → email. Or create a fresh personal-email project and point `.env` at it — you're moving region anyway (see below).

A word I'd rather say plainly than leave you to discover later: **many employment contracts assign to the employer anything built on company equipment or in company time**, and company laptops frequently run monitoring or DLP agents. I'm not a lawyer and this isn't legal advice — but if this project might ever matter to you commercially, it's worth reading your contract, and worth doing the remaining work on your own machine. Moving it off is exactly what the rest of this document does.

---

## 1. Put the code somewhere that isn't a laptop

A private GitHub repository under your **personal** account. Ten minutes, and it's the thing that makes the laptop switch a non-event.

The repository is already initialised and everything is staged. Set your identity and make the first commit:

```powershell
cd D:\APP
git config user.name "Your Name"
git config user.email "you@personal-email.com"
git commit -m "Karya: small business operations platform"
```

Then create an **empty private repository** on github.com (no README, no .gitignore — you already have both), and push:

```powershell
git remote add origin https://github.com/YOUR-USERNAME/karya.git
git push -u origin main
```

**`.env` is deliberately not committed** — it holds your database password and session secret. `.gitignore` already excludes it. Keep those two values in a password manager, because they are the only things you cannot recover from the repository.

---

## 2. Move the database to Singapore while you're at it

You noted the project is in **AWS US East 2 (Ohio)** — roughly 250 ms from Ahmedabad, which is most of the slowness you've been feeling. Neon can't change a project's region in place, so this is a create-and-copy. Since you're likely re-creating under a personal email anyway, do both at once:

1. Neon console → **New project** → region **AWS Asia Pacific (Singapore)** → personal email account.
2. Copy the new pooled connection string (hostname contains `-pooler`, keep `?sslmode=require`).
3. Put it in `.env` as `DATABASE_URL`.
4. `npm run db:push` to create the tables.
5. Re-enter your Precious Knots records, or use Neon's **Import Data Assistant** to copy the old project across.

Expect roughly a 4× improvement in every page load. Nothing in the code changes.

---

## 3. Deploy it, so it doesn't depend on any laptop being open

Full instructions are in **DEPLOY.md**. The short version, once the code is on GitHub:

1. vercel.com → sign in **with GitHub** → Import your `karya` repository.
2. Set environment variables (Project → Settings → Environment Variables):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Singapore Neon string |
   | `AUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(36).toString('base64'))"` — a **new** one, not your local value |
   | `STORAGE_DRIVER` | `database` — required on Vercel, whose disk is wiped between requests |
   | `APP_URL` | your live address, e.g. `https://karya.vercel.app` |
   | `NODE_ENV` | `production` |

3. Deploy. Every `git push` from then on redeploys automatically.

---

## Switching to your personal laptop

Once the three steps above are done, the switch is four commands:

```powershell
git clone https://github.com/YOUR-USERNAME/karya.git
cd karya
npm install
# create .env with DATABASE_URL and AUTH_SECRET from your password manager
npm run dev
```

Same database, same live site, nothing lost. The company laptop becomes irrelevant — and you can delete `D:\APP` from it, which is probably what you want anyway.

---

## What lives where, afterwards

| Thing | Where it lives | Survives losing the laptop? |
|---|---|---|
| Code | GitHub, private repo | Yes |
| Live application | Vercel | Yes |
| Business data | Neon (Singapore) | Yes |
| Receipts and photos | Inside Neon, with `STORAGE_DRIVER=database` | Yes |
| `.env` secrets | Your password manager | Only if you put them there — **do this** |
| `D:\APP` working copy | The company laptop | No, and it no longer matters |
