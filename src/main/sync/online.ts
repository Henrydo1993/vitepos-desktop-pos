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
    // Vitepos's online-list relays QR/waiter orders here WITHOUT their line items; those are
    // printed properly by pollOpalOrders (wc/v3). Printing a zero-item order here would just
    // spit out a blank duplicate ticket + a "0 items" toast, so skip it (already marked seen).
    if (o.items.length === 0) continue
    fresh.push(o)
  }
  return fresh
}

// Ordering-app orders polled straight from WooCommerce (see fetchOpalOrders). A separate
// seen table keeps it from colliding with the Vitepos online-list poll. Carries the table
// label + note so the prepare ticket prints big with the table name.
//
// IMPORTANT: this does NOT mark orders seen. The caller marks an order seen only once it has
// actually been recorded on the floor tab (see deliverOpalOrder). Marking on fetch is what
// silently dropped orders: any hiccup after the mark (print failure, a throw) lost the order
// forever, because it was already recorded as "handled" and never re-polled.
export async function pollOpalOrders(db: Database.Database, s: Session): Promise<OnlineOrder[]> {
  const rows = await fetchOpalOrders(s)
  const seen = db.prepare(`SELECT 1 FROM seen_opal WHERE remote_id=?`)
  const fresh: OnlineOrder[] = []
  for (const raw of rows) {
    if (!raw.id || seen.get(raw.id)) continue
    fresh.push({ remoteId: raw.id, token: raw.id, items: raw.items, total: 0, table: raw.table, note: raw.note, source: raw.source })
  }
  return fresh
}

export function markOpalSeen(db: Database.Database, id: number): void {
  db.prepare(`INSERT OR IGNORE INTO seen_opal (remote_id, seen_at) VALUES (?, ?)`).run(id, new Date().toISOString())
}

// Deliver ONE ordering-app order to the floor + kitchen, safely:
//   1. record it on the table's tab (so it's visible on the floor). If this throws, we do NOT
//      mark it seen, so the next poll (15s) retries it instead of losing it.
//   2. only then mark it seen — now it can't be re-fetched or duplicated.
//   3. print best-effort — a printer hiccup surfaces onPrintFail but must NOT lose the order
//      (it's already recorded; the operator can reprint).
// Dependencies are injected so the exact ordering is unit-testable without the DB or a printer.
export interface DeliverDeps {
  record: (o: OnlineOrder) => void
  markSeen: (id: number) => void
  print: (o: OnlineOrder) => void | Promise<void>
  onReceived: (o: OnlineOrder) => void
  onPrintFail: (o: OnlineOrder, err: unknown) => void
}
export async function deliverOpalOrder(o: OnlineOrder, deps: DeliverDeps): Promise<void> {
  deps.record(o)
  deps.markSeen(o.remoteId)
  try {
    // Awaited on purpose: the printer path is serialized, so this resolves only once the ticket has
    // actually printed (or rejects after its retries are exhausted). A fire-and-forget print would
    // make onPrintFail unreachable — which is exactly how failed tickets used to vanish silently.
    await deps.print(o)
  } catch (err) {
    // Recorded on the floor but the ticket didn't print. Raise the red alarm ONLY — do not also
    // fire the reassuring "→ kitchen" chime, which would contradict it. Operator reprints manually.
    deps.onPrintFail(o, err)
    return
  }
  deps.onReceived(o)
}
