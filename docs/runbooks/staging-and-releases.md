# Staging and releases (P1.6)

How a change gets from a laptop to the client without being tested on the client.

## The three environments

| Environment | Code | Database | Who uses it |
|---|---|---|---|
| **Local** | Your working copy | Neon `development` branch (endpoint `ep-divine-waterfall`), via `.env` | You |
| **Preview** | Any branch except `main`, built by Vercel automatically | Neon `development` branch | You, before merging |
| **Production** | `main` | Neon `production` branch (endpoint `ep-round-smoke`) | The client |

The rule that makes this safe: **only Production may hold the production connection string.**

## One-time setup: check Vercel's environment variables

Vercel → project → **Settings → Environment Variables**. Each variable shows which environments it applies to: Production, Preview, Development.

1. **`DATABASE_URL`**
   - If a single entry applies to *Production and Preview*, **every branch preview is running against the client's live data.** Fix it:
     1. Edit that entry so it applies to **Production only**.
     2. Add a second `DATABASE_URL` entry for **Preview** (and Development) set to the `development` branch connection string. Check that its host contains `ep-divine-waterfall`.
2. **`AUTH_SECRET`**: give Preview its own value, different from Production. A preview session cookie must not be valid on the live site.
3. **`STORAGE_DRIVER`** = `database` for both Production and Preview.
4. **`APP_URL`**: Production only.
5. **`REGISTRATION`**: leave unset everywhere (invite-only) until email verification exists.
6. **`SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`**: same value for both; Sentry labels events by environment.

Also check **Settings → Deployment Protection**: keep Vercel Authentication on for previews, so preview URLs aren't public.

After changing variables, redeploy both the latest production deployment and any open preview for them to take effect.

**Verify once:** push a throwaway branch and open its preview URL. Sign in with an account from the development branch and create a test order. Then confirm that order does **not** appear on the live site.

## Everyday release flow

```bash
git switch -c fix-something
git add -A
git commit -m "What changed"
git push -u origin fix-something
```

1. Vercel builds a preview and posts its URL (Vercel dashboard → Deployments, or on the GitHub branch).
2. Test the change on the preview.
3. Run the checks locally:

```bash
npm run typecheck
npm test
npm run test:integration
```

4. Merge to `main`, either by opening a pull request on GitHub and merging it, or:

```bash
git switch main
git merge fix-something
git push origin main
```

Production redeploys in about two minutes.

Small documentation-only changes can go straight to `main`.

## Schema changes

Until P1.7 settles one workflow, follow `docs/10-transfer-to-new-laptop.md` §6:

1. Edit `src/server/db/schema.ts`.
2. Run `npm run db:generate`, then `npm run db:migrate`. This applies to development.
3. Test on a preview.
4. Apply to production as a separate, deliberate step.

**Deploy code that tolerates both the old and new schema before migrating production**, or migrate first when the change is purely additive.

## Rolling back

Vercel → **Deployments** → the last good production deployment → **⋯ → Instant Rollback** (or **Promote to Production**). This takes seconds.

Rolling back **does not undo database changes**. If a bad release wrote bad data, see `restore-drill.md` ("A real restore").
