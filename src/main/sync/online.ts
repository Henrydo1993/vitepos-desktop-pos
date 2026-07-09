import type Database from 'better-sqlite3'
import type { Session } from '../api/auth'
import { fetchOnlineOrders, fetchOpalOrders } from '../api/client'
import type { TicketItem } from '../print/router'

export interface OnlineOrder {
  remoteId: number
  token: number
  items: (TicketItem & { price: number })[]
  total: number
  table?: string
  note?: string
  source?: string
}

// Defensive mapping — the exact online-order item shape is confirmed on the first real
// website order (none live yet). Adjust field names against `fixtures/online.json` then.
export function normalizeOnlineOrder(raw: any): OnlineOrder {
  const rawItems: any[] = raw.items ?? raw.line_items ?? raw.products ?? []
  const items = rawItems.map((it) => ({
    name: String(it.name ?? it.product_name ?? 'Item'),
    qty: Number(it.qty ?? it.quantity ?? 1),
    price: Number(it.price ?? it.total ?? 0),
    station: 'kitchen',
    modifiers: (it.addons ?? it.meta ?? []).map((m: any) => String(m?.value ?? m?.name ?? m)),
  }))
  return {
    remoteId: Number(raw.order_id ?? raw.id ?? 0),
    token: Number(raw.token ?? raw.order_id ?? raw.id ?? 0),
    items,
    total: Number(raw.grand_total ?? raw.total ?? 0),
  }
}

// Online orders not seen before (to auto-print). Marks them seen so they print once.
export async function pollOnline(db: Database.Database, s: Session): Promise<OnlineOrder[]> {
  const rows = await fetchOnlineOrders(s)
  const seen = db.prepare(`SELECT 1 FROM seen_online WHERE remote_id=?`)
  const mark = db.prepare(`INSERT OR IGNORE INTO seen_online (remote_id, seen_at) VALUES (?, ?)`)
  const fresh: OnlineOrder[] = []
  for (const raw of rows) {
    const o = normalizeOnlineOrder(raw)
    if (!o.remoteId || seen.get(o.remoteId)) continue
    mark.run(o.remoteId, new Date().toISOString())
    fresh.push(o)
  }
  return fresh
}

// Ordering-app orders polled straight from WooCommerce (see fetchOpalOrders). A separate
// seen table keeps it from colliding with the Vitepos online-list poll. Carries the table
// label + note so the prepare ticket prints big with the table name.
export async function pollOpalOrders(db: Database.Database, s: Session): Promise<OnlineOrder[]> {
  const rows = await fetchOpalOrders(s)
  const seen = db.prepare(`SELECT 1 FROM seen_opal WHERE remote_id=?`)
  const mark = db.prepare(`INSERT OR IGNORE INTO seen_opal (remote_id, seen_at) VALUES (?, ?)`)
  const fresh: OnlineOrder[] = []
  for (const raw of rows) {
    if (!raw.id || seen.get(raw.id)) continue
    mark.run(raw.id, new Date().toISOString())
    fresh.push({ remoteId: raw.id, token: raw.id, items: raw.items, total: 0, table: raw.table, note: raw.note, source: raw.source })
  }
  return fresh
}
