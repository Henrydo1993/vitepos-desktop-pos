import type Database from 'better-sqlite3'
import type { Session } from '../api/auth'
import { syncOfflineOrder } from '../api/client'

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
    order_note: order.void_reason ?? '',
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
  const pending = db.prepare(`SELECT * FROM orders WHERE synced=0 ORDER BY id LIMIT 20`).all() as OrderRow[]
  let pushed = 0
  for (const o of pending) {
    const items = db.prepare(`SELECT product_id,name,qty,price FROM order_items WHERE order_id=?`).all(o.id) as ItemRow[]
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
