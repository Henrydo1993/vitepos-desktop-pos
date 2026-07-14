import type Database from 'better-sqlite3'
import type { Session } from '../api/auth'
import { syncOfflineOrder, getWcOrder, updateWcOrder } from '../api/client'

interface OrderRow {
  id: number
  token: number
  subtotal: number
  tax: number
  discount: number
  total: number
  tender: number
  change: number
  payment_method: string
  voided: number
  void_reason: string | null
  order_type: string | null
  note: string | null
  customer_id: number | null
  created_at: string
}
interface ItemRow {
  product_id: number
  name: string
  qty: number
  price: number
}

// Build the sync-offline-order payload from a local order + its items.
// NOTE: field names are inferred from Vitepos `_vtp_*` order meta. Verify with one
// on-site test order (`npm run probe:sync`) and adjust if the endpoint rejects it.
export function buildOfflinePayload(order: OrderRow, items: ItemRow[], outletId: string, counterId: string) {
  return {
    is_offline: true,
    offline_id: `pos-${order.id}`,
    offline_process_date: order.created_at,
    outlet_id: Number(outletId),
    counter_id: Number(counterId),
    status: order.voided ? 'cancelled' : 'completed',
    order_type: order.order_type ?? 'takeaway',
    customer_id: order.customer_id ?? null,
    order_note: order.note || order.void_reason || '',
    sub_total: order.subtotal,
    tax_total: order.tax,
    discount_total: order.discount,
    grand_total: order.total,
    items: items.map((it) => ({ product_id: it.product_id, qty: it.qty, price: it.price, name: it.name })),
    payment_list: [{ method: order.payment_method || 'cash', amount: order.total }],
    tendered_amount: order.tender,
    change_amount: order.change,
  }
}

export async function pushPending(db: Database.Database, s: Session, outletId: string, counterId: string) {
  // Cap retries: a persistently-failing order must NOT be re-pushed forever. Each failed
  // push can spawn a bare stray order on the store, so an uncapped loop floods it with $0s.
  const pending = db.prepare(`SELECT * FROM orders WHERE synced=0 AND COALESCE(push_tries,0) < 3 ORDER BY id LIMIT 20`).all() as OrderRow[]
  let pushed = 0
  for (const o of pending) {
    const items = db.prepare(`SELECT product_id,name,qty,price FROM order_items WHERE order_id=?`).all(o.id) as ItemRow[]
    if (!items.length) {
      // Never push an empty order — that is exactly what spawned the $0-order flood.
      db.prepare(`UPDATE orders SET push_tries=3, sync_error='empty order — not pushed' WHERE id=?`).run(o.id)
      continue
    }
    db.prepare(`UPDATE orders SET push_tries=COALESCE(push_tries,0)+1 WHERE id=?`).run(o.id) // count the attempt before it runs
    try {
      const res = await syncOfflineOrder(s, buildOfflinePayload(o, items, outletId, counterId))
      if (res.ok) {
        const remoteId = res.data?.data?.order_id ?? res.data?.data?.id ?? null
        db.prepare(`UPDATE orders SET synced=1, remote_id=?, sync_error=NULL WHERE id=?`).run(remoteId, o.id)
        pushed++
      } else {
        db.prepare(`UPDATE orders SET sync_error=? WHERE id=?`).run(JSON.stringify(res.data).slice(0, 500), o.id)
      }
    } catch (e) {
      db.prepare(`UPDATE orders SET sync_error=? WHERE id=?`).run(String(e).slice(0, 500), o.id)
    }
  }
  return { pending: pending.length, pushed }
}

// Drop local orders that were deleted on the live store, so the POS report matches it.
// Reconciles against WooCommerce directly (wc/v3) by the `_vtp_offline_id = pos-<localId>`
// meta the POS itself stamps on every pushed order — reliable regardless of whether the
// remote id was captured, and the Vitepos order-list endpoint returns nothing here.
// Safe: only touches SYNCED orders, only within a recent, confirmed window.
export async function reconcileDeletedOrders(db: Database.Database, s: Session) {
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const res = await s.http.get(`/?rest_route=/wc/v3/orders&per_page=100&orderby=id&order=desc&after=${encodeURIComponent(cutoff)}`)
  if (!Array.isArray(res.data)) return { removed: 0 } // couldn't confirm — change nothing
  const wc = (res.data as any[]).filter((o) => (o.meta_data ?? []).some((m: any) => m.key === '_is_vitepos'))
  const live = new Set<string>()
  let oldest = new Date().toISOString()
  for (const o of wc) {
    const off = (o.meta_data ?? []).find((m: any) => m.key === '_vtp_offline_id')?.value
    if (off) live.add(String(off))
    const c = o.date_created_gmt ? `${o.date_created_gmt}Z` : o.date_created
    if (c && c < oldest) oldest = c
  }
  // Store has POS orders but none carried an offline id → shape mismatch, don't risk it.
  if (wc.length > 0 && live.size === 0) return { removed: 0 }
  // Confirmed window: if the page was full there may be older orders we didn't see, so
  // only reconcile back to the oldest order actually fetched; otherwise the full cutoff.
  const floor = wc.length >= 100 ? oldest : cutoff
  // Exclude QR/waiter-settled orders: their WooCommerce record is the _opc_source order we
  // updated in place (not a _vtp_offline_id push), so they'd never be in `live` and would be
  // wrongly deleted here.
  const local = db.prepare('SELECT id FROM orders WHERE synced=1 AND opal_remote_ids IS NULL AND created_at >= ?').all(floor) as { id: number }[]
  const del = db.transaction((oid: number) => {
    db.prepare('DELETE FROM order_items WHERE order_id=?').run(oid)
    db.prepare('DELETE FROM orders WHERE id=?').run(oid)
  })
  let removed = 0
  for (const o of local) {
    if (live.has(`pos-${o.id}`)) continue // still on the store — keep
    del(o.id) // within the confirmed window and missing → deleted on the store
    removed++
  }
  return { removed }
}

// ── QR/waiter table settle ────────────────────────────────────────────────
// A dine-in tab that originated from QR/waiter orders must NOT become a second
// WooCommerce order on payment. Instead we settle it onto its ORIGINAL order(s):
// the first becomes the completed, paid record with the final items; any extra
// interim-round orders are cancelled. One PUT per order id — never a create — so
// it cannot repeat the $0-flood pattern.
export interface SettleItem {
  product_id?: number
  name: string
  qty: number
}
export async function settleOpalOrder(
  s: Session,
  originIds: number[],
  finalItems: SettleItem[],
  payment: { method: string; title: string },
): Promise<{ ok: boolean; settledId?: number; error?: string }> {
  if (!originIds.length) return { ok: false, error: 'no origin order' }
  const primary = originIds[0]
  try {
    const order = await getWcOrder(s, primary)
    if (!order?.id) return { ok: false, error: 'origin order not found' }
    // Replace the line items: zero every existing one, then add the final set.
    const existing = (order.line_items ?? []) as { id: number }[]
    const line_items: Record<string, unknown>[] = existing.map((li) => ({ id: li.id, quantity: 0 }))
    for (const it of finalItems) {
      if (it.product_id && it.product_id > 0) line_items.push({ product_id: it.product_id, quantity: it.qty })
    }
    const res = await updateWcOrder(s, primary, {
      status: 'completed',
      set_paid: true,
      payment_method: payment.method,
      payment_method_title: payment.title,
      line_items,
    })
    if (!res.ok) return { ok: false, error: 'settle update failed' }
    for (const extra of originIds.slice(1)) {
      await updateWcOrder(s, extra, { status: 'cancelled' }).catch(() => undefined)
    }
    return { ok: true, settledId: primary }
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 300) }
  }
}

// Cancel a QR/waiter table's WooCommerce order(s) — when a tab is voided/cleared unpaid.
export async function cancelOpalOrders(s: Session, ids: number[]): Promise<void> {
  for (const id of ids) {
    await updateWcOrder(s, id, { status: 'cancelled' }).catch(() => undefined)
  }
}

// Retry settles that couldn't reach the store at payment time (offline). Runs on the
// manual ⟳ Sync, not the background tick.
export async function settlePendingOpal(db: Database.Database, s: Session): Promise<{ settled: number }> {
  const rows = db
    .prepare(`SELECT id, opal_remote_ids, payment_method FROM orders WHERE opal_settled=0 AND opal_remote_ids IS NOT NULL`)
    .all() as { id: number; opal_remote_ids: string; payment_method: string }[]
  let settled = 0
  for (const r of rows) {
    let ids: number[] = []
    try {
      ids = JSON.parse(r.opal_remote_ids || '[]')
    } catch {
      /* skip */
    }
    if (!ids.length) {
      db.prepare('UPDATE orders SET opal_settled=1 WHERE id=?').run(r.id)
      continue
    }
    const items = db.prepare('SELECT product_id, name, qty FROM order_items WHERE order_id=?').all(r.id) as SettleItem[]
    const res = await settleOpalOrder(s, ids, items, { method: r.payment_method || 'cash', title: 'POS' })
    if (res.ok) {
      db.prepare('UPDATE orders SET opal_settled=1, remote_id=? WHERE id=?').run(res.settledId ?? null, r.id)
      settled++
    }
  }
  return { settled }
}
