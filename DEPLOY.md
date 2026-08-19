# Putting Karya online

Aimed at getting one real business using this. Read it once before starting; the whole thing takes about half an hour.

---

## Choose a host

Anything that runs Node works. The one decision that matters is **where receipts are stored**, and it follows from the host:

| Host | `STORAGE_DRIVER` | Why |
|---|---|---|
| **Railway / Render / Fly / a VPS** | `local` or `database` | These give you a real disk. `local` is fine. |
| **Vercel / Netlify** | `database` (required) | Their filesystem is wiped between requests. With `local`, every receipt uploaded would vanish minutes later. |

If you are unsure, choose `database`. It puts attachments inside Postgres, which means one fewer service to run and — more importantly — your receipts are covered by the same backups as everything else. Watch the database size and move to object storage if attachments ever outgrow it. That means implementing three methods in `src/server/storage.ts` and changing nothing else.

**Recommendation for this business:** Vercel (free) + Neon (free) + `STORAGE_DRIVER=database`. No servers to babysit, and both have usable free tiers at this scale.

---

## 1. Prepare the database

You already have a Neon project from local development. Make a **separate** one for production — you do not want a stray `npm run db:seed` wiping real orders.

1. Neon dashboard → new project, e.g. `karya-production`.
2. Copy its pooled connection string (the host contains `-pooler`), keeping `?sslmode=require`.
3. Check **Settings → Backups** and note the retention on your plan. Whatever it says is how far back a mistake can be undone.

## 2. Generate a production secret

```bash
node -e "console.log(require('crypto').randomBytes(36).toString('base64'))"
```

Use a **different** value from your development one. Anyone holding it can mint session cookies for any account.

## 3. Deploy

### Vercel

```bash
npm install -g vercel
cd D:\APP
vercel
```

Accept the defaults. Then set the environment variables (Project → Settings → Environment Variables):

| Name | Value |
|---|---|
| `DATABASE_URL` | the production Neon string |
| `AUTH_SECRET` | the secret from step 2 |
| `STORAGE_DRIVER` | `database` |
| `APP_URL` | your live address, e.g. `https://karya.vercel.app` |
| `NODE_ENV` | `production` |

Redeploy so they take effect: `vercel --prod`.

### Railway or Render

Point it at the repository, set the same variables (with `STORAGE_DRIVER=local`), build with `npm run build`, start with `npm start`. Attach a persistent volume mounted at `./storage`.

## 4. Create the tables

From your own machine, with `.env` **temporarily** pointing at the production database:

```bash
npm run db:push
```

Do **not** run `npm run db:seed` against production. That command deletes the demo user's workspaces and recreates them; it is for development only.

## 5. First run

1. Open your live address and **Create an account** — this becomes the owner.
2. Onboarding: business name, type, and the **Handmade / Craft** template.
3. Settings → Business: check currency, timezone and date format.
4. Settings → Users: invite your friend. No email is sent — copy the note the screen gives you and message her yourself. She joins automatically when she registers with that address.
5. Import her Google Sheet: File → Download → Microsoft Excel, then `/import`.

## 6. Before it carries real work

- **Sign in as her** (or have her do it) and confirm she sees the right things for her role.
- **Test password recovery once, deliberately.** Settings → Users → Reset next to her name produces a single-use link valid for an hour. Send it, have her use it, confirm she can sign in afterwards. Better to find out now than the morning she is locked out.
- **If the owner is locked out**, there is no one above them. From a machine with the production `DATABASE_URL`: `npm run reset-password -- her@email.com`, which prints a link.
- **Run alongside the Google Sheet for two weeks.** If the two ever disagree, that is a bug worth knowing about while the sheet still exists.
- **Set a reminder to check `npm run db:reconcile`** occasionally — it recomputes every order's paid total from the payment records and exits non-zero if anything had drifted.

---

## Keeping it running

| Task | How often | Command |
|---|---|---|
| Check payment totals reconcile | monthly | `npm run db:reconcile` |
| Review the audit log | occasionally | Settings → Audit log |
| Update dependencies | quarterly | `npm outdated`, then `npm update` |
| Confirm backups exist | before you rely on them | Neon dashboard → Backups |

## Things this deployment does not have

Named so nobody discovers them at a bad moment:

- **No email at all.** Invitations and password resets are links you deliver yourself.
- **No file antivirus.** Uploads are checked for type and size and served with `nosniff` and a CSP sandbox, but the contents are not scanned.
- **No automated backups beyond your database provider's.** Attachments live in the database under `STORAGE_DRIVER=database`, so they are covered; under `local` they are not, and the disk is yours to back up.
- **Single region.** Fine for one business in one city; latency will show if that changes.
