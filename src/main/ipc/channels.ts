import { ipcMain, app } from 'electron'
import type BetterSqlite3 from 'better-sqlite3'
import type { Session } from '../api/auth'
import { listMenu } from '../db/repo'
import { syncCatalog } from '../sync/catalog'
import { fetchVariations, searchCustomers, createCustomer } from '../api/client'
import { pushPending } from '../sync/orders'
import { pollOnline } from '../sync/online'
import { getSettings, saveSettings, seedPrintersFromSettings, type Settings } from '../config'
import { priceOrder, type PriceLine, type Discount } from '../order/pricing'
import { routeByStation, type TicketItem } from '../print/router'
import { buildKitchenTicket, buildReceipt } from '../print/tickets'
import { printWithRetry, type PrinterCfg } from '../print/engine'

type Notify = (channel: string, data: unknown) => void
type SessionRef = { current: Session }
type PricedItem = TicketItem & { price: number; product_id?: number }

interface CommitPayload {
  items: (TicketItem & { price: number; product_id: number })[]
  totals: { subtotal: number; discount: number; tax: number; total: number; tender: number; change: number }
  paymentMethod?: string
  orderType?: string
  note?: string
  customerId?: number
  customerName?: string
}

const outletOf = (db: BetterSqlite3.Database) => {
  const s = getSettings(db)
  return { outlet: s.outlet, counter: s.counter }
}

function printersOf(db: BetterSqlite3.Database): Record<string, PrinterCfg> {
  const rows = db.prepare('SELECT station,type,address FROM printers').all() as PrinterCfg[]
  return Object.fromEntries(rows.map((p) => [p.station, p]))
}

function printReceiptAndTickets(
  db: BetterSqlite3.Database,
  token: number,
  items: PricedItem[],
  totals: { subtotal: number; discount: number; tax: number; total: number; tender: number; change: number } | null,
  meta: { orderType?: string; note?: string; customerName?: string } = {},
) {
  const byStation = printersOf(db)
  if (totals && byStation.counter) {
    void printWithRetry(
      byStation.counter,
      buildReceipt({ token, items, ...totals, orderType: meta.orderType, customerName: meta.customerName }),
      { kickDrawer: true },
    )
  }
  for (const [station, list] of Object.entries(routeByStation(items))) {
    const cfg = byStation[station]
    if (cfg)
      void printWithRetry(
        cfg,
        buildKitchenTicket({ token, station: station.toUpperCase(), items: list, orderType: meta.orderType, note: meta.note }),
      )
  }
}

export function registerIpc(db: BetterSqlite3.Database, sessionRef: SessionRef, rebuildSession: () => void) {
  ipcMain.handle('catalog:sync', () => syncCatalog(db, sessionRef.current))
  ipcMain.handle('menu:list', () => listMenu(db))
  ipcMain.handle('printers:list', () => db.prepare('SELECT station,type,address FROM printers').all())
  ipcMain.handle('product:variations', (_e, productId: number) => fetchVariations(sessionRef.current, productId))
  ipcMain.handle('order:price', (_e, lines: PriceLine[], d: Discount) => priceOrder(lines, d))
  ipcMain.handle('sync:now', () => {
    const { outlet, counter } = outletOf(db)
    return pushPending(db, sessionRef.current, outlet, counter)
  })
  ipcMain.handle('customer:search', (_e, q: string) => searchCustomers(sessionRef.current, q))
  ipcMain.handle('customer:create', (_e, data: Record<string, unknown>) => createCustomer(sessionRef.current, data))
  ipcMain.handle('orders:recent', () =>
    db.prepare(`SELECT id,token,total,payment_method,voided,synced,sync_error,created_at FROM orders ORDER BY id DESC LIMIT 25`).all(),
  )
  ipcMain.handle('print:test', async (_e, cfg: PrinterCfg) => {
    await printWithRetry(cfg, `*** TEST PRINT ***\n${cfg.station.toUpperCase()}\n${new Date().toLocaleString()}`)
    return { ok: true }
  })

  // --- App version / auto-update marker (renderer shows this + proves a self-update) ---
  ipcMain.handle('app:info', () => {
    const row = db.prepare("SELECT value FROM meta WHERE key='last_seen_version'").get() as { value?: string } | undefined
    return { version: app.getVersion(), lastSeen: row?.value ?? '' }
  })
  ipcMain.handle('app:markSeen', () => {
    db.prepare("INSERT INTO meta (key,value) VALUES ('last_seen_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(
      app.getVersion(),
    )
    return { ok: true }
  })

  // --- Settings ---
  ipcMain.handle('settings:get', () => getSettings(db))
  ipcMain.handle('settings:save', (_e, patch: Settings) => {
    saveSettings(db, patch)
    seedPrintersFromSettings(db, getSettings(db))
    rebuildSession()
    return { ok: true }
  })

  ipcMain.handle('order:commit', (_e, payload: CommitPayload) => {
    const token = (
      db.prepare(`SELECT COALESCE(MAX(token),0)+1 t FROM orders WHERE date(created_at)=date('now')`).get() as { t: number }
    ).t
    const info = db
      .prepare(
        `INSERT INTO orders (token,status,subtotal,tax,discount,total,tender,change,payment_method,order_type,note,customer_id,customer_name,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        token,
        'completed',
        payload.totals.subtotal,
        payload.totals.tax,
        payload.totals.discount,
        payload.totals.total,
        payload.totals.tender,
        payload.totals.change,
        payload.paymentMethod ?? 'cash',
        payload.orderType ?? 'takeaway',
        payload.note ?? '',
        payload.customerId ?? null,
        payload.customerName ?? null,
        new Date().toISOString(),
      )
    const oid = info.lastInsertRowid as number
    const insItem = db.prepare(
      `INSERT INTO order_items (order_id,product_id,name,qty,price,station,modifiers) VALUES (?,?,?,?,?,?,?)`,
    )
    for (const it of payload.items) {
      insItem.run(oid, it.product_id, it.name, it.qty, it.price, it.station, JSON.stringify(it.modifiers ?? []))
    }
    printReceiptAndTickets(db, token, payload.items, payload.totals, {
      orderType: payload.orderType,
      note: payload.note,
      customerName: payload.customerName,
    })
    return { token, orderId: oid }
  })

  ipcMain.handle('order:reprint', (_e, orderId: number) => {
    const o = db.prepare(`SELECT * FROM orders WHERE id=?`).get(orderId) as any
    if (!o) throw new Error('order not found')
    const items = (db.prepare(`SELECT * FROM order_items WHERE order_id=?`).all(orderId) as any[]).map((it) => ({
      name: it.name,
      qty: it.qty,
      price: it.price,
      station: it.station,
      modifiers: JSON.parse(it.modifiers || '[]'),
    }))
    const byStation = printersOf(db)
    if (byStation.counter) {
      void printWithRetry(
        byStation.counter,
        buildReceipt({
          token: o.token,
          items,
          subtotal: o.subtotal,
          discount: o.discount,
          tax: o.tax,
          total: o.total,
          tender: o.tender,
          change: o.change,
          orderType: o.order_type,
          customerName: o.customer_name,
        }),
      )
    }
    return { ok: true }
  })

  ipcMain.handle('order:void', (_e, orderId: number, reason: string) => {
    db.prepare(`UPDATE orders SET voided=1, void_reason=?, status='cancelled', synced=0 WHERE id=?`).run(reason, orderId)
    return { ok: true }
  })
}

// Background loop: push local orders to WooCommerce and pull website orders to the kitchen.
export function startSync(db: BetterSqlite3.Database, sessionRef: SessionRef, notify: Notify) {
  const tick = async () => {
    try {
      const { outlet, counter } = outletOf(db)
      const res = await pushPending(db, sessionRef.current, outlet, counter)
      if (res.pushed) notify('sync:progress', res)
    } catch {
      /* offline — retry next tick */
    }
    try {
      const fresh = await pollOnline(db, sessionRef.current)
      for (const o of fresh) {
        printReceiptAndTickets(db, o.token, o.items, null)
        notify('online:new', { token: o.token, total: o.total, items: o.items.length })
      }
    } catch {
      /* offline */
    }
  }
  const interval = Number(process.env.SYNC_INTERVAL_MS ?? 15000)
  setInterval(() => void tick(), interval)
  void tick()
}
