# Go live — the exact steps

Follow top to bottom. Every command is for **PowerShell on Windows**. Each part ends with a check, so you know it worked before moving on.

Total time: about 45 minutes, most of it waiting.

---

## Part 0 — Prerequisites (5 min)

```powershell
cd D:\APP
git --version
node -v
```

`node` should print v20 or higher. If `git` is not recognised:

```powershell
winget install Git.Git
```

Then **close PowerShell and open a new window** (the PATH doesn't refresh in the current one), and check `git --version` again.

**Accounts you'll need — all with your *personal* email, never your work address:**

| Service | Sign up at | Cost |
|---|---|---|
| GitHub | github.com | Free |
| Neon | neon.tech | Free |
| Vercel | vercel.com | Free |

Sign up for GitHub now. You'll create the other two as you reach them.

---

## Part 1 — Save the code to GitHub (10 min)

The repository is already initialised and all 228 files are staged. You only need to identify yourself and commit.

### 1.1 Commit

```powershell
cd D:\APP
git config user.name "Your Name"
git config user.email "you@personal-email.com"
git commit -m "Karya: small business operations platform"
```

**Check:** it should print something like `228 files changed, ... insertions(+)`.

```powershell
git log --oneline
git status
```

`git status` must say **"nothing to commit, working tree clean"**. If it lists `.env`, stop and tell me — that file must never be committed.

### 1.2 Create an empty repository on GitHub

1. Go to https://github.com/new
2. **Repository name:** `karya`
3. **Private** — select this, not Public
4. **Do not tick** "Add a README", "Add .gitignore", or "Choose a license". The repository must be completely empty.
5. Click **Create repository**

### 1.3 Push

Copy your username into this and run it:

```powershell
git remote add origin https://github.com/YOUR-USERNAME/karya.git
git push -u origin main
```

A browser window will open asking you to sign in to GitHub. Do that.

**Check:** refresh the GitHub page. You should see your files. Click into the repository and confirm there is **no `.env` file** in the list. There should be a `.env.example`, which is fine — it contains only placeholders.

> Your code is now safe. Everything after this is improvement, not rescue.

---

## Part 2 — New database in Singapore (10 min)

Your current database is in Ohio, ~250 ms from Ahmedabad, which is most of the slowness. Neon cannot move a project between regions, so this creates a new one.

### 2.1 Create the project

1. Go to https://neon.tech and sign up (or sign in) **with your personal email**
2. **New Project**
3. **Name:** `karya-production`
4. **Region:** `AWS Asia Pacific (Singapore)` — this is the important field
5. **Create**

### 2.2 Copy the connection string

On the project dashboard, find the connection string. Make sure:

- **Pooled connection** is selected — the hostname will contain `-pooler`
- It ends with `?sslmode=require`

It looks like:

```
postgresql://neondb_owner:npg_XXXX@ep-something-123456-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

### 2.3 Generate a production secret

```powershell
node -e "console.log(require('crypto').randomBytes(36).toString('base64'))"
```

Copy the output. **Save both of these into your password manager now** — the connection string and this secret. They are the only two things you cannot recover from GitHub.

### 2.4 Point your local app at the new database

```powershell
cd D:\APP
notepad .env
```

Replace the `DATABASE_URL` line with your new Singapore string. Leave everything else. Save and close.

```powershell
npm run db:push
```

Answer **Yes, I want to execute all statements** (arrow key down, Enter).

**Check:**

```powershell
npm run dev
```

Open http://localhost:3000. You will see the **sign-in page with no accounts**, because this is a brand-new empty database. That is correct.

> Your old Ohio data — the Prishious Knots records — is still in the old project and is **not** carried over. It was test data, so the clean start is fine. If you want it moved, stop here and use Neon's **Import Data Assistant** instead, then tell me.

Register an account and click through a page or two. It should feel noticeably quicker than before. Then `Ctrl + C` to stop.

---

## Part 3 — Deploy to Vercel (10 min)

### 3.1 Import the repository

1. Go to https://vercel.com
2. **Sign up with GitHub** (this links the accounts, so pushes deploy automatically)
3. **Add New → Project**
4. Find `karya` in the list → **Import**
5. Vercel will detect Next.js on its own. **Do not change** the build settings.

### 3.2 Set the environment variables

**Before clicking Deploy**, expand **Environment Variables** and add these five:

| Name | Value |
|---|---|
| `DATABASE_URL` | your Singapore connection string |
| `AUTH_SECRET` | the secret from step 2.3 |
| `STORAGE_DRIVER` | `database` |
| `NODE_ENV` | `production` |
| `APP_URL` | `https://karya.vercel.app` — a placeholder for now, corrected in 3.4 |

`STORAGE_DRIVER=database` is **not optional on Vercel.** Its filesystem is wiped between requests, so with the default `local` every receipt your friend uploads would silently disappear.

### 3.3 Deploy

Click **Deploy** and wait 2–4 minutes.

**Check:** you get a "Congratulations" screen with a live URL like `https://karya-abc123.vercel.app`. Open it — you should see the sign-in page.

### 3.4 Fix APP_URL

Copy your real URL from that page, then:

1. Project → **Settings** → **Environment Variables**
2. Edit `APP_URL` → paste the real address (no trailing slash) → Save
3. **Deployments** tab → the top deployment → **⋯** → **Redeploy**

This only affects password-reset links, but it makes them point at the right place.

---

## Part 4 — Set up the real workspace (10 min)

On your **live URL**, not localhost:

1. **Create an account** — this becomes the owner. Use an email your friend's business should be run from.
2. **Onboarding:** business name (`Prishious Knots`), type, and the **Handmade / Craft** template.
3. **Settings → Business:** check currency (₹), timezone (Asia/Kolkata) and date format.
4. **Settings → Custom fields → On each line of an order:** add `Colour`, `Material`, and whatever else her products vary by. This is what makes the *To make* list useful.
5. **Settings → Users:** invite your friend by email. No message is sent — copy the note the screen gives you and send it to her yourself. She joins automatically when she registers with that address.
6. **Import** her Google Sheet: in Sheets, File → Download → Microsoft Excel (.xlsx), then use the `/import` wizard.

**Do not run `npm run db:seed` against this database.** That command deletes and recreates the demo workspace; it is for development only.

---

## Part 5 — Moving to your personal laptop

Whenever you're ready. On the new machine:

```powershell
git clone https://github.com/YOUR-USERNAME/karya.git
cd karya
npm install
Copy-Item .env.example .env
notepad .env
```

Paste `DATABASE_URL` and `AUTH_SECRET` from your password manager, save, then:

```powershell
npm run dev
```

Same database, same live site, nothing lost.

Once that works, you can delete `D:\APP` from the company laptop.

### Making changes from then on

```powershell
git add -A
git commit -m "what you changed"
git push
```

Vercel redeploys automatically, in about two minutes.

---

## If something goes wrong

| What you see | What to do |
|---|---|
| `git` not recognised after installing | Close **all** PowerShell windows and open a new one |
| `remote origin already exists` | `git remote set-url origin https://github.com/YOUR-USERNAME/karya.git` |
| Push rejected, "fetch first" | The GitHub repo wasn't empty. Delete it and recreate with nothing ticked |
| Vercel build fails | Open the build log; if it mentions a missing environment variable, one of the five in 3.2 is absent |
| Live site: "Invalid environment configuration" | `AUTH_SECRET` is missing or shorter than 32 characters |
| Live site: `relation "users" does not exist` | Step 2.4 didn't run against this database. Re-run `npm run db:push` with the production `DATABASE_URL` in `.env` |
| Receipts vanish after a while | `STORAGE_DRIVER` isn't `database`. Fix it in Vercel settings and redeploy |
| First page load each morning is slow | Neon's free tier sleeps after ~5 minutes idle. Expected; only the first request pays it |

---

## What you'll have at the end

| | Where | Survives losing the laptop |
|---|---|---|
| Code | GitHub, private | Yes |
| Live app | Vercel | Yes |
| Data | Neon, Singapore | Yes |
| Receipts | Inside Neon | Yes |
| Secrets | Your password manager | Only if you put them there |
