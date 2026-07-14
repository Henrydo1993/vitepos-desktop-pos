# Opal POS — Audit & Fix List

Living list from the security + condition-logic audit. Highest severity first.
Each item: what's wrong, where, the fix, and how we'll know it's fixed.

Status key: 🔴 open · 🟡 in progress · ✅ done · 🔎 needs live confirmation

---

## #1 🔴 CRITICAL — QR/table order, POS, and WooCommerce must be ONE synced order

**Symptom (business impact):** a single dine-in table visit can become **two orders in
WooCommerce → the sale is double-counted in reports.** POS-side edits to the table never
reach WooCommerce, so the records also diverge.

**How it happens today**
1. Guest scans QR → plugin creates a WooCommerce order (`_opc_source=qr`, `_opc_table`,
   status `processing`).
2. POS polls every 15s and copies the items into a **local** tab (`open_orders`) keyed by
   table label (`mergeOpalTab`, `channels.ts:154`). This is a one-way copy.
3. Removing/adding items on the POS updates **only the local tab** (`openorder:save`). There
   is **no write-back** to the WooCommerce order — it keeps its original items.
4. Paying the tab (`order:commit`, `channels.ts:515`) creates a **new** POS-native order
   (`_is_vitepos`) and **deletes the local tab** — it never touches the original QR order.
   Result on WooCommerce: the original QR order **stays at `processing`** *and* a second
   order exists for the same visit. (Auto-push is off, so the second one only lands on a
   manual ⟳ Sync — compounding the mismatch.)

**Root cause:** sync is one-directional (WooCommerce → POS). The tab stores no reference to
its origin WooCommerce order, and the payment/void paths ignore that origin order entirely.

**Fix**
- Add `remote_id` (origin WC order id) to `open_orders`; `mergeOpalTab` records `o.remoteId`.
- On payment of a **QR/waiter-origin** tab: **UPDATE that same WooCommerce order** — set its
  line items to the final tab, set it paid/`completed`, record the payment method — instead
  of creating a second order. Do **not** create a `_is_vitepos` duplicate for these.
- On **removing/adding** items to such a tab: reflect it on the WooCommerce order (on close
  at minimum; ideally on save).
- On **void** of such a tab: **cancel** the WooCommerce order (don't leave it `processing`).
- Walk-in (POS-native) tabs are unchanged — they still create their own order via `pushPending`.
- The write is **one controlled `PUT wc/v3/orders/{id}` per table close**, guarded (no retry
  loop, never empty) so it cannot repeat the $0-flood pattern.

**Acceptance criteria**
- [ ] Exactly **one** WooCommerce order per QR/waiter table visit.
- [ ] That order reflects the **final** items actually served/charged.
- [ ] Removing an item on the POS updates the WooCommerce order (no divergence).
- [ ] The sale appears **once** in reports.
- [ ] Voiding a QR tab **cancels** the WooCommerce order (no dangling `processing`).

**Touches:** `channels.ts` (`order:commit`, `mergeOpalTab`, `openorder:*`), `sync/orders.ts`,
`api/client.ts` (new WC order update), `db/schema.ts` (`open_orders.remote_id`).

---

## #2 🔎 Duplicate / blank kitchen ticket — both pollers process the same order

**Symptom:** every QR order may also print a **blank ticket** and raise a "0 items" toast.

**Cause:** `pollOnline` (Vitepos `order/online-list`) and `pollOpalOrders` (WooCommerce
`_opc_source`) use **separate** seen-tables (`seen_online` vs `seen_opal`). Vitepos relays the
QR orders **without line items**, so `pollOnline` prints them empty while `pollOpalOrders`
prints them for real (`sync/online.ts`, `channels.ts` tick).

**Fix:** in `pollOnline`, skip orders that have `_opc_source` or **zero items** — those are
owned by `pollOpalOrders`. (Confirm on the live till whether blank tickets / "0 items" toasts
actually appear before/after.)

**Acceptance:** [ ] one ticket per QR order, no blank tickets, no "0 items" toast.

---

## #3 🔴 HIGH — Roles are not enforced (no separation of duties)

**Symptom:** the `role` field (admin/manager/cashier/staff) is **display-only** — shown on the
lock screen + sidebar, gating nothing. There are **no** `role===` checks in the renderer and
the main-process IPC handlers receive no auth context. So **any** signed-in staff can:
**void/refund orders, change Settings (incl. the WooCommerce credentials), remove staff,
open/close shifts.**

**Impact:** theft vector (a cashier can void a paid sale and pocket cash), and anyone can edit
credentials or wipe staff.

**Fix**
- Define a permission map per role (e.g. cashier: sell only; manager: + void/refund/shift;
  admin: + settings/staff).
- Gate in the **renderer** (hide/disable) **and** enforce in **main** — pass the acting
  staff id + verify their role in the IPC handler for privileged actions
  (`order:void`, `settings:save`, `staff:add/remove`, `shift:*`). Renderer-only gating is
  bypassable.

**Acceptance:** [ ] a cashier PIN cannot void, refund, open Settings, or remove staff — blocked
in the UI *and* rejected by the handler.

---

## #4 🔴 HIGH — Credentials at rest: plaintext App Password + weak PIN hash

**Symptom:** the WooCommerce **Application Password is stored in plaintext** in local settings
(`config.ts`/SQLite) and only base64-encoded for the Basic header — no encryption. Staff PINs
are hashed with an **unsalted fast `sha`** of a 4-digit code (~10k combos → trivially
reversible from the DB).

**Impact:** anyone with read access to the userData folder gets **full WooCommerce API
credentials** and can reverse every PIN.

**Fix**
- Encrypt the App Password with Electron **`safeStorage`** (OS keychain) at rest; decrypt only
  in memory to build the session.
- Salt PINs (per-staff random salt) and/or use a slow KDF; at minimum add a salt + rate-limit
  verify attempts.

**Acceptance:** [ ] App Password not readable in the DB/file; [ ] PIN hashes are salted and not
reversible by lookup.

---

## #5 🟡 MEDIUM — Shift ↔ order attribution is timestamp-only

**Symptom:** `computeShiftSummary` attributes orders by **time window**
(`created_at >= opened_at [AND < closed_at]`) — there is **no `shift_id` on orders.**
Consequences: orders rung with **no shift open fall outside every window → missing from the
day report**; and `dash:today` counts by **calendar day** (`date(created_at)=date('now')`),
which **disagrees with the shift window** for overnight shifts or pre-open sales.

**Fix**
- Add `shift_id` to `orders`; stamp the current open shift on `order:commit`.
- Summaries + the day report group by `shift_id`; if no shift is open, either block selling or
  attach to a synthetic "no-shift" bucket that still shows in reports.
- Reconcile `dash:today` and the shift report onto the same basis.

**Acceptance:** [ ] every order belongs to exactly one shift; [ ] day report totals == sum of
its orders; [ ] no sale is invisible to reporting.

---

## Backlog — flagged in the inventory, not yet reviewed

- POS sales don't auto-reach WooCommerce (auto-push off since v1.0.28) → report/WC divergence.
- `reconcileDeletedOrders` could drop legitimate orders inside its window.
- Auto-update `autoInstallOnAppQuit` in kiosk with no rollback.
- Plugin REST endpoints public (`__return_true`) incl. `/register-ip` — poisonable Wi-Fi gate.
- Cash rounding vs counted-cash reconciliation at shift close.
- Electron shell: `sandbox:false`, no CSP, no navigation guard.
