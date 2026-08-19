# Getting Karya running

Everything below is copy-pasteable into **PowerShell** on Windows. Total time: about 10 minutes, most of it waiting for `npm install`.

---

## Step 0 — Check you have Node 20 or newer

```powershell
node -v
```

If that errors, or prints anything below `v20`, install the **LTS** build from <https://nodejs.org>, then close and reopen PowerShell.

---

## Step 1 — Get a PostgreSQL database

Pick **one**. Option A needs no installation and is the fastest way to see the app working.

### Option A — Neon (cloud, free, recommended)

1. Go to <https://neon.tech> and sign up (GitHub or Google login works).
2. Create a project — any name, any region. Pick a region near you.
3. On the project dashboard, copy the **connection string**. It looks like:
   ```
   postgresql://neondb_owner:AbC123xyz@ep-cool-name-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
4. Keep that string handy for Step 3.

### Option B — PostgreSQL on your own machine

1. Download the Windows installer from <https://www.postgresql.org/download/windows/> and run it.
2. During setup it asks for a password for the `postgres` user — **write it down**.
3. Leave the port as `5432`.
4. After it finishes, create the database:
   ```powershell
   & "C:\Program Files\PostgreSQL\17\bin\createdb.exe" -U postgres karya
   ```
   (Adjust `17` to whichever version you installed. It will prompt for the password from step 2.)
5. Your connection string is:
   ```
   postgresql://postgres:YOUR_PASSWORD@localhost:5432/karya
   ```
   If your password contains `@`, `:`, `/` or `#`, either change it to something alphanumeric or URL-encode those characters.

### Option C — Docker

```powershell
docker run --name karya-db -e POSTGRES_PASSWORD=karya -e POSTGRES_DB=karya -p 5432:5432 -d postgres:16
```

Connection string: `postgresql://postgres:karya@localhost:5432/karya`

---

## Step 2 — Install the dependencies

```powershell
cd D:\APP
npm install
```

This takes a few minutes and downloads roughly 200 packages. Warnings are normal; errors are not.

---

## Step 3 — Create your `.env` file

```powershell
cd D:\APP
Copy-Item .env.example .env
notepad .env
```

Notepad opens. Change exactly two lines:

```
DATABASE_URL="paste-your-connection-string-from-step-1-here"
AUTH_SECRET="paste-a-long-random-string-here"
```

To generate the random secret, run this and paste the output:

```powershell
node -e "console.log(require('crypto').randomBytes(36).toString('base64'))"
```

Save and close Notepad. Leave `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR` and `NODE_ENV` as they are.

> Keep the quotes around both values. `AUTH_SECRET` must be at least 32 characters — the app refuses to start otherwise, on purpose.

---

## Step 4 — Create the tables

```powershell
cd D:\APP
npm run db:push
```

It prints the tables it is creating and finishes with `[✓] Changes applied`.

If it hangs or times out, the connection string is wrong or the database isn't reachable — check Step 1 before going further.

---

## Step 5 — Load the demo data

```powershell
npm run db:seed
```

You should see:

```
Seeding demo workspace…

Done.

  Workspace : Threads by Riya
  Sign in   : demo@karya.app / demo1234
  Orders    : 11
  Customers : 6
  Products  : 10
```

This creates a full crochet business: 11 orders in various stages, per-customer pricing, two events with a live production plan, and a month of expenses. Run it again any time to reset back to this state.

---

## Step 6 — Start the app

```powershell
npm run dev
```

Open <http://localhost:3000> and sign in with:

- **Email:** `demo@karya.app`
- **Password:** `demo1234`

Stop the server with `Ctrl + C`.

---

## What to try first

1. **Dashboard** — today's numbers, what needs attention, and production progress for the university fest.
2. **Orders → click any order with a red or amber balance** → click the balance badge → record a payment and watch it turn green.
3. **Orders → New order** — pick *Priya Shah*, then add *Bunny Plushie*. The price fills in at ₹500 with the caption "Agreed price for this customer". Change the customer to *Ananya Mehta* and it becomes ₹650. That's the pricing engine, not a hardcoded example.
4. **Events → Ahmedabad University Fest** — hit `+1` on a line and watch the ring, the remaining count and the dashboard all update.
5. **Settings → Terminology** — change *Customer* to *Client* and *Order* to *Job*, save, and look at the sidebar. Then **Settings → Modules** and switch off Events.
6. **Import** — export your friend's real Google Sheet (File → Download → Microsoft Excel) and run it through the wizard. The column mapping guesses most of it.

---

## If something goes wrong

| What you see | What it means |
|---|---|
| `AUTH_SECRET must be at least 32 characters` | Step 3 — the secret is too short or the line is still the placeholder. |
| `DATABASE_URL is required` | The `.env` file isn't in `D:\APP`, or the line is commented out. |
| `ECONNREFUSED` on `db:push` | The database isn't running (Option B/C) or the host in the connection string is wrong. |
| `password authentication failed` | Wrong password in the connection string, or a special character in it needs URL-encoding. |
| `relation "orders" does not exist` | Step 4 was skipped or failed. Run `npm run db:push` again. |
| Port 3000 already in use | `npm run dev -- -p 3001`, then open <http://localhost:3001>. |
| `npm install` fails on a corporate network | You're likely behind a proxy — `npm config set proxy http://your-proxy:port`. |
| `npm` not recognised in a *new* window | Node's installer didn't persist `PATH`. Run: `[Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path","User") + ";C:\Program Files\nodejs", "User")` then reopen PowerShell. |
| `running scripts is disabled on this system` | `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` |
| `This module cannot be imported from a Client Component module` | The CLI scripts need Node's `react-server` resolution condition; `db:seed` and `db:reconcile` already pass `--conditions=react-server`. If you run a script by hand, include that flag. |

---

## Other commands

```powershell
npm run db:studio      # browse and edit the data in a GUI
npm test               # run the domain tests (38 of them)
npm run typecheck      # TypeScript check
npm run build          # production build
npm start              # run the production build
npm run db:reconcile   # verify every order's paid total against its payment records
```
