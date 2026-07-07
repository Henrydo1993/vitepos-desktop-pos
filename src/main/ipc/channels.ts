import { ipcMain } from 'electron'
import type BetterSqlite3 from 'better-sqlite3'
import { listMenu } from '../db/repo'
import { makeSession, type Session } from '../api/auth'
import { syncCatalog } from '../sync/catalog'
import { priceOrder, type PriceLine, type Discount } from '../order/pricing'
import { routeByStation, type TicketItem } from '../print/router'
import { buildKitchenTicket, buildReceipt } from '../print/tickets'
import { printWithRetry, type PrinterCfg } from '../print/engine'

interface CommitPayload {
  items: (TicketItem & { price: number; product_id: number })[]
  totals: { subtotal: number; discount: number; tax: number; total: number; tender: number; change: number }
}

export function registerIpc(db: BetterSqlite3.Database, env: Record<string, string>) {
  let session: Session | null = null
  const outlet = `${env.VITEPOS_OUTLET}|${env.VITEPOS_COUNTER}`
  const ensureSession = () => {
    if (!session) session = makeSession(env.VITEPOS_BASE_URL, env.VITEPOS_POS_USER, env.VITEPOS_APP_PASSWORD, outlet)
    return session
  }

  ipcMain.handle('catalog:sync', () => syncCatalog(db, ensureSession()))
  ipcMain.handle('menu:list', () => listMenu(db))
  ipcMain.handle('printers:list', () => db.prepare('SELECT station,type,address FROM printers').all())
  ipcMain.handle('order:price', (_e, lines: PriceLine[], d: Discount) => priceOrder(lines, d))
  ipcMain.handle('print:test', async (_e, cfg: PrinterCfg) => {
    await printWithRetry(cfg, `*** TEST PRINT ***\n${cfg.station.toUpperCase()}\n${new Date().toLocaleString()}`)
    return { ok: true }
  })

  ipcMain.handle('order:commit', (_e, payload: CommitPayload) => {
    const token = (
      db.prepare(`SELECT COALESCE(MAX(token),0)+1 t FROM orders WHERE date(created_at)=date('now')`).get() as { t: number }
    ).t
    const info = db
      .prepare(
        `INSERT INTO orders (token,status,subtotal,tax,discount,total,tender,change,created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
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
        new Date().toISOString(),
      )
    const oid = info.lastInsertRowid as number
    const insItem = db.prepare(
      `INSERT INTO order_items (order_id,product_id,name,qty,price,station,modifiers) VALUES (?,?,?,?,?,?,?)`,
    )
    for (const it of payload.items) {
      insItem.run(oid, it.product_id, it.name, it.qty, it.price, it.station, JSON.stringify(it.modifiers ?? []))
    }

    const printers = db.prepare('SELECT station,type,address FROM printers').all() as PrinterCfg[]
    const byStation: Record<string, PrinterCfg> = Object.fromEntries(printers.map((p) => [p.station, p]))
    if (byStation.counter) {
      void printWithRetry(byStation.counter, buildReceipt({ token, ...payload.totals, items: payload.items }), {
        kickDrawer: true,
      })
    }
    for (const [station, items] of Object.entries(routeByStation(payload.items))) {
      const cfg = byStation[station]
      if (cfg) void printWithRetry(cfg, buildKitchenTicket({ token, station: station.toUpperCase(), items }))
    }
    return { token, orderId: oid }
  })
}
