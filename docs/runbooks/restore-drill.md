# Restore drill (P1.4)

A backup you have never restored is a hope, not a backup. This drill proves you can get the client's data back, and tells you **how far back** you can go, before the day you need it.

**When:** once now, then every three months, and before any risky production migration.
**Time:** about 30 minutes.
**Risk to production:** none. The drill restores into a *new branch* and never touches `production`.

Receipts and photos are stored inside Postgres (`STORAGE_DRIVER=database`), so they are covered by the same restore.

## 1. Find your restore window

Neon console → project **karya-production** → **Settings** → look for **history retention** / **restore window** (also shown on the **Backup & Restore** page).

Write the number into the table at the bottom. On the free plan it is short. If it's shorter than the time it could take you to notice a problem (for example a weekend), that's the reason to move P1.3 (paid plan) earlier.

## 2. Restore a past moment into a new branch

1. **Branches → Create branch**.
2. Parent: **production**.
3. Choose to include data **from a specific point in time**. Pick a moment about an hour ago (it must be inside the window).
4. Name: `restore-drill-YYYYMMDD`. Set it to auto-delete after a day if the option exists.
5. Create.

## 3. Check the restored data

Open **SQL Editor**. **Set the branch selector to `restore-drill-YYYYMMDD` and check it twice.**

```sql
select
  (select count(*) from organizations) as workspaces,
  (select count(*) from customers)     as customers,
  (select count(*) from orders)        as orders,
  (select count(*) from payments)      as payments,
  (select count(*) from expenses)      as expenses,
  (select count(*) from attachment_blobs) as files,
  (select max(created_at) from orders) as latest_order;
```

Run the same **read-only** query with the selector on **production**. The counts should match, apart from anything created after the moment you restored to, and `latest_order` should be no later than that moment.

If you want, open one restored receipt to be sure file bytes came back:

```sql
select storage_key, octet_length(data) as bytes from attachment_blobs limit 5;
```

## 4. Clean up

**Branches** → `restore-drill-YYYYMMDD` → **Delete**.

## 5. Record it

| Date | Restore window | Restored to | Counts matched | Minutes taken | Notes |
|---|---|---|---|---|---|
| | | | | | |

---

## A real restore (emergency)

Stop and think before acting. A rushed restore can lose more than the incident did.

1. **Ask the client to pause entering data**, and note the exact time things went wrong.
2. **Restore into a new branch first** (steps 2–3 above), at a moment *just before* the problem.
3. **Choose the smallest fix:**
   - **A few rows were damaged or deleted.** Copy just those rows back from the restored branch into production. This keeps everything entered since.
   - **Everything is wrong.** Use Neon's **Restore** on the `production` branch to that moment. Everything written after it is lost, so write down what the client entered since so it can be re-entered. Neon keeps the pre-restore state as a backup branch; don't delete it until you're sure.
4. If a code release caused it, **roll back the deployment first** (see `staging-and-releases.md`) so it doesn't happen again straight after.
5. Tell the client plainly what was affected and what, if anything, they need to re-enter. If personal data was exposed, follow `incident-response.md`.
