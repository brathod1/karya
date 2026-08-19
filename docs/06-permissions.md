# F. Permission Model

## Roles

| Role | Intended holder | Capability |
|---|---|---|
| **OWNER** | The business owner | Everything, including billing, deleting the workspace, and transferring ownership. Exactly one per org; cannot be removed. |
| **ADMIN** | Trusted partner (in this case: you, helping run the business) | Everything except workspace deletion and ownership transfer. Can change configuration and invite users. |
| **STAFF** | Helper, family member, employee | Day-to-day operations: create/edit orders, customers, products, payments, expenses, event production. **Cannot** change configuration, cannot see the audit log, cannot invite users, cannot export the full database. |
| **VIEWER** | Accountant, advisor | Read-only across enabled modules, plus exports. No mutations of any kind. |

## Permission matrix

| Capability | OWNER | ADMIN | STAFF | VIEWER |
|---|:--:|:--:|:--:|:--:|
| View dashboard & analytics | ✓ | ✓ | ✓ | ✓ |
| Create / edit orders, items, statuses on orders | ✓ | ✓ | ✓ | — |
| Archive an order | ✓ | ✓ | — | — |
| Record a payment | ✓ | ✓ | ✓ | — |
| Void / refund a payment | ✓ | ✓ | — | — |
| Create / edit customers, products, expenses, events | ✓ | ✓ | ✓ | — |
| Set customer-specific prices | ✓ | ✓ | — | — |
| See product cost & profit | ✓ | ✓ | — | ✓ |
| Import spreadsheet data | ✓ | ✓ | — | — |
| Export CSV / XLSX | ✓ | ✓ | ✓ | ✓ |
| Change configuration (statuses, terminology, fields, modules) | ✓ | ✓ | — | — |
| Invite / remove users, change roles | ✓ | ✓ | — | — |
| Attach or remove files | ✓ | ✓ | ✓ | — |
| Share a saved view with the whole workspace | ✓ | ✓ | — | — |
| View audit log | ✓ | ✓ | — | — |
| Delete workspace, transfer ownership | ✓ | — | — | — |

## Enforcement

Permissions are declared once as `PERMISSIONS: Record<Role, Set<Capability>>` and checked in three layers:

1. **Server Action** — `requireCapability('payment:void')` throws before any work. This is the authoritative check; everything else is convenience.
2. **Page** — `requireCapability` at the top of protected route segments, so a direct URL cannot render a settings screen.
3. **UI** — `can('payment:void')` hides or disables controls, so users are never shown an action that will fail.

Tenant scoping is orthogonal and unconditional: `requireOrgContext()` resolves session → membership → org, and every query is built with the `scope(table, orgId, …)` helper, so no role can reach another organization's data even with a forged id.

## Invitations

There is no email service in this application, so an invitation is a **pending membership** keyed on an email address, activated the first time that person registers or signs in with it. The UI says exactly that rather than implying a message was sent. Safeguards: only an owner may grant or alter the owner role, the last owner cannot be demoted or removed, and nobody can remove themselves.

## Session security

HTTP-only, `SameSite=Lax`, `Secure` in production, signed JWT (`jose`, HS256) carrying `{ userId, orgId, sessionVersion }`, 30-day sliding expiry. `sessionVersion` on the user row lets a password change or a "sign out everywhere" action invalidate all issued cookies instantly. Passwords are bcrypt cost 12.

Sign-in and registration are rate-limited: five failed attempts per email address and thirty per device in any fifteen-minute window, and ten registrations per device per hour. A correct password clears that email's counter, so one forgotten password today cannot lock the account out tomorrow. Attempts are counted in a database table rather than in process memory, because an in-memory counter is worth nothing the moment the app runs on more than one instance or restarts — which is precisely when someone is hammering it.
