import { ipcMain, app } from 'electron'
import { createHash } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import type { Session } from '../api/auth'
import { listMenu } from '../db/repo'
import { syncCatalog } from '../sync/catalog'
import { fetchVariations, searchCustomers, createCustomer, fetchReceiptConfig, fetchOpalTables } from '../api/client'
import { pushPending, reconcileDeletedOrders } from '../sync/orders'
import { pollOnline, pollOpalOrders, type OnlineOrder } from '../sync/online'
import { getSettings, saveSettings, seedPrintersFromSettings, type Settings } from '../config'
import { priceOrder, type PriceLine, type Discount } from '../order/pricing'
import { routeByStation, stationForCategory, stationLabel, type TicketItem } from '../print/router'
import { buildKitchenTicket, DEFAULT_RECEIPT, type ReceiptConfig, type DayReport } from '../print/tickets'
import { printWithRetry, printReceiptWithRetry, printReportWithRetry, printKitchenWithRetry, type PrinterCfg } from '../print/engine'

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
  staffName?: string
  openOrderId?: number
}

const outletOf = (db: BetterSqlite3.Database) => {
  const s = getSettings(db)
  return { outlet: s.outlet, counter: s.counter }
}

function printersOf(db: BetterSqlite3.Database): Record<string, PrinterCfg> {
  const rows = db.prepare('SELECT station,type,address FROM printers').all() as PrinterCfg[]
  return Object.fromEntries(rows.map((p) => [p.station, p]))
}

// Cached table floor from the opal-pos-connect plugin (public GET /tables) — the
// same list the ordering app uses, so WordPress is one source of truth. Falls
// back to the local table_count when never fetched / offline with no cache.
interface CachedTable {
  label: string
  area: string
  seats: number
}
function getCachedTables(db: BetterSqlite3.Database): CachedTable[] {
  const row = db.prepare("SELECT value FROM meta WHERE key='opal_tables'").get() as { value?: string } | undefined
  if (row?.value) {
    try {
      return JSON.parse(row.value) as CachedTable[]
    } catch {
      /* fall through */
    }
  }
  return []
}
async function cacheOpalTables(db: BetterSqlite3.Database, s: Session) {
  try {
    const tbls = await fetchOpalTables(s)
    if (tbls.length)
      db.prepare("INSERT INTO meta (key,value) VALUES ('opal_tables',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(tbls))
  } catch {
    /* offline — keep last cached floor */
  }
}

// Cached Vitepos receipt/invoice config (fetched from /basic/settings on sync).
function getReceiptCfg(db: BetterSqlite3.Database): ReceiptConfig {
  const row = db.prepare("SELECT value FROM meta WHERE key='cfg_receipt'").get() as { value?: string } | undefined
  if (row?.value) {
    try {
      return JSON.parse(row.value) as ReceiptConfig
    } catch {
      /* fall through to default */
    }
  }
  return DEFAULT_RECEIPT
}
async function cacheReceiptCfg(db: BetterSqlite3.Database, s: Session) {
  try {
    const rc = await fetchReceiptConfig(s)
    db.prepare("INSERT INTO meta (key,value) VALUES ('cfg_receipt',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(rc))
  } catch {
    /* offline — keep last cached config */
  }
}

interface OpenOrderPayload {
  id?: number
  tableLabel?: string
  orderType?: string
  note?: string
  customerId?: number | null
  customerName?: string | null
  staffName?: string | null
  lines?: unknown[]
}
function saveOpenOrder(db: BetterSqlite3.Database, p: OpenOrderPayload): number {
  const now = new Date().toISOString()
  const linesJson = JSON.stringify(p.lines ?? [])
  if (p.id) {
    db.prepare(
      'UPDATE open_orders SET table_label=?,order_type=?,note=?,customer_id=?,customer_name=?,staff_name=?,lines=?,updated_at=? WHERE id=?',
    ).run(p.tableLabel ?? null, p.orderType ?? 'table', p.note ?? '', p.customerId ?? null, p.customerName ?? null, p.staffName ?? null, linesJson, now, p.id)
    return p.id
  }
  const info = db
    .prepare('INSERT INTO open_orders (table_label,order_type,note,customer_id,customer_name,staff_name,lines,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(p.tableLabel ?? null, p.orderType ?? 'table', p.note ?? '', p.customerId ?? null, p.customerName ?? null, p.staffName ?? null, linesJson, now, now)
  return Number(info.lastInsertRowid)
}

interface ShiftRow {
  id: number
  opened_at: string
  opened_by: string | null
  opening_float: number
  closed_at: string | null
  closed_by: string | null
  counted_cash: number | null
  status: string
}
function computeShiftSummary(db: BetterSqlite3.Database, shift: ShiftRow) {
  // Open shift: everything since it opened. Closed shift: bounded to its close
  // time, so a reprint reflects that day only — not orders taken afterwards.
  const win = shift.closed_at ? 'created_at >= ? AND created_at < ?' : 'created_at >= ?'
  const args: string[] = shift.closed_at ? [shift.opened_at, shift.closed_at] : [shift.opened_at]
  const sum = db.prepare(`SELECT COUNT(*) orders, COALESCE(SUM(total),0) gross FROM orders WHERE voided=0 AND ${win}`).get(...args) as { orders: number; gross: number }
  const byMethod = db
    .prepare(`SELECT payment_method method, COUNT(*) n, COALESCE(SUM(total),0) amt FROM orders WHERE voided=0 AND ${win} GROUP BY payment_method ORDER BY amt DESC`)
    .all(...args) as { method: string; n: number; amt: number }[]
  const cash = db.prepare(`SELECT COALESCE(SUM(total),0) c FROM orders WHERE voided=0 AND payment_method='cash' AND ${win}`).get(...args) as { c: number }
  return { orders: sum.orders, gross: sum.gross, byMethod, cashSales: cash.c, cashExpected: (shift.opening_float || 0) + cash.c }
}

// Ordering-app orders arrive from WooCommerce without a station, so assign each item one
// (front-of-house vs kitchen) from its product's category for split prepare printing.
function assignStations(db: BetterSqlite3.Database, items: (TicketItem & { price: number })[]) {
  const get = db.prepare('SELECT category FROM products WHERE id=?')
  return items.map((it) => {
    const pid = (it as { productId?: number }).productId
    const cat = pid ? (get.get(pid) as { category?: string } | undefined)?.category : undefined
    return { ...it, station: stationForCategory(cat) }
  })
}

// Merge an incoming ordering-app order into the table's open tab, so the floor shows the
// table TAKEN and every order for it (QR scan, waiter, counter) accumulates into ONE bill —
// no duplicate tabs. Items are marked sent (already printed to the kitchen).
function mergeOpalTab(db: BetterSqlite3.Database, o: OnlineOrder) {
  if (!o.table) return
  const lines = o.items.map((it, i) => ({
    id: o.remoteId * 1000 + i,
    name: it.name,
    price: it.price,
    qty: it.qty,
    station: it.station ?? 'kitchen',
    modifiers: it.modifiers ?? [],
    sent: true,
  }))
  const now = new Date().toISOString()
  const existing = db.prepare('SELECT id, lines FROM open_orders WHERE table_label=? ORDER BY id DESC LIMIT 1').get(o.table) as
    | { id: number; lines: string }
    | undefined
  if (existing) {
    let prev: unknown[] = []
    try {
      prev = JSON.parse(existing.lines || '[]')
    } catch {
      /* ignore */
    }
    db.prepare('UPDATE open_orders SET lines=?, updated_at=? WHERE id=?').run(JSON.stringify([...prev, ...lines]), now, existing.id)
  } else {
    const who = o.source === 'waiter' ? 'Waiter' : 'QR order'
    db.prepare('INSERT INTO open_orders (table_label,order_type,note,staff_name,lines,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(
      o.table,
      'table',
      o.note ?? '',
      who,
      JSON.stringify(lines),
      now,
      now,
    )
  }
}

function printReceiptAndTickets(
  db: BetterSqlite3.Database,
  token: number,
  items: PricedItem[],
  totals: { subtotal: number; discount: number; tax: number; total: number; tender: number; change: number } | null,
  meta: { orderType?: string; note?: string; customerName?: string; staffName?: string; table?: string } = {},
  fireTickets = true,
) {
  const byStation = printersOf(db)
  if (totals && byStation.counter) {
    void printReceiptWithRetry(
      byStation.counter,
      { token, items, ...totals, orderType: meta.orderType, customerName: meta.customerName, staffName: meta.staffName },
      getReceiptCfg(db),
      { kickDrawer: true },
    )
  }
  if (!fireTickets) return
  // One prepare ticket per station — front-of-house vs kitchen — each to its own printer
  // if configured, otherwise its own separate ticket on the counter.
  for (const [station, list] of Object.entries(routeByStation(items))) {
    const cfg = byStation[station] ?? byStation.counter
    if (cfg) void printKitchenWithRetry(cfg, buildKitchenTicket({ token, station: stationLabel(station), table: meta.table, items: list, orderType: meta.orderType, note: meta.note }))
  }
}

export function registerIpc(db: BetterSqlite3.Database, sessionRef: SessionRef, rebuildSession: () => void) {
  void cacheOpalTables(db, sessionRef.current) // pull the WordPress floor once on startup
  ipcMain.handle('catalog:sync', async () => {
    const r = await syncCatalog(db, sessionRef.current)
    await cacheReceiptCfg(db, sessionRef.current)
    await cacheOpalTables(db, sessionRef.current)
    return r
  })
  ipcMain.handle('menu:list', () => listMenu(db))
  ipcMain.handle('printers:list', () => db.prepare('SELECT station,type,address FROM printers').all())
  ipcMain.handle('product:variations', (_e, productId: number) => fetchVariations(sessionRef.current, productId))
  ipcMain.handle('order:price', (_e, lines: PriceLine[], d: Discount) => priceOrder(lines, d))
  ipcMain.handle('sync:now', () => {
    const { outlet, counter } = outletOf(db)
    return pushPending(db, sessionRef.current, outlet, counter)
  })
  // Full refresh from the header ⟳: pull catalog, push pending sales, reconcile
  // orders against the live store (drop ones deleted there), pull website orders.
  ipcMain.handle('sync:refresh', async () => {
    const { outlet, counter } = outletOf(db)
    let products = 0
    let productsRemoved = 0
    try {
      const cat = await syncCatalog(db, sessionRef.current)
      products = cat.products
      productsRemoved = cat.removed
    } catch {
      /* offline — keep cached catalog */
    }
    await cacheReceiptCfg(db, sessionRef.current)
    await cacheOpalTables(db, sessionRef.current)
    const push = await pushPending(db, sessionRef.current, outlet, counter).catch(() => ({ pending: 0, pushed: 0 }))
    const recon = await reconcileDeletedOrders(db, sessionRef.current).catch(() => ({ removed: 0 }))
    try {
      const fresh = await pollOnline(db, sessionRef.current)
      for (const o of fresh) printReceiptAndTickets(db, o.token, o.items, null)
    } catch {
      /* offline */
    }
    try {
      const opal = await pollOpalOrders(db, sessionRef.current)
      for (const o of opal) {
        const staged = assignStations(db, o.items)
        mergeOpalTab(db, { ...o, items: staged })
        printReceiptAndTickets(db, o.token, staged, null, { table: o.table, note: o.note, orderType: 'table' })
      }
    } catch {
      /* offline */
    }
    return { products, productsRemoved, pushed: push.pushed, removed: recon.removed }
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

  // --- Local unlock PIN (sha-256 in meta; unlocks the till without the WP password) ---
  const sha = (s: string) => createHash('sha256').update(s).digest('hex')
  const pinHash = () => (db.prepare("SELECT value FROM meta WHERE key='pin_hash'").get() as { value?: string } | undefined)?.value
  ipcMain.handle('pin:status', () => ({ set: !!pinHash() }))
  ipcMain.handle('pin:set', (_e, pin: string) => {
    db.prepare("INSERT INTO meta (key,value) VALUES ('pin_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(sha(String(pin)))
    return { ok: true }
  })
  ipcMain.handle('pin:verify', (_e, pin: string) => {
    const h = pinHash()
    return { ok: !!h && h === sha(String(pin)) }
  })

  // --- Staff / multi-user sign-in (PINs sha-256; a legacy single PIN becomes "Manager") ---
  const nowIso = () => new Date().toISOString()
  {
    const legacy = pinHash()
    const count = (db.prepare('SELECT COUNT(*) c FROM staff').get() as { c: number }).c
    if (legacy && count === 0)
      db.prepare("INSERT INTO staff (name,pin_hash,role,active,created_at) VALUES ('Manager',?,'manager',1,?)").run(legacy, nowIso())
  }
  ipcMain.handle('staff:list', () => db.prepare('SELECT id,name,role FROM staff WHERE active=1 ORDER BY id').all())
  ipcMain.handle('staff:add', (_e, name: string, pin: string, role: string) => {
    const info = db
      .prepare('INSERT INTO staff (name,pin_hash,role,active,created_at) VALUES (?,?,?,1,?)')
      .run(String(name).trim() || 'Staff', sha(String(pin)), role || 'staff', nowIso())
    return { ok: true, id: Number(info.lastInsertRowid) }
  })
  ipcMain.handle('staff:verify', (_e, staffId: number, pin: string) => {
    const row = db.prepare('SELECT id,name,role,pin_hash FROM staff WHERE id=? AND active=1').get(staffId) as
      | { id: number; name: string; role: string; pin_hash: string }
      | undefined
    if (row && row.pin_hash === sha(String(pin))) return { ok: true, staff: { id: row.id, name: row.name, role: row.role } }
    return { ok: false }
  })
  ipcMain.handle('staff:remove', (_e, staffId: number) => {
    db.prepare('UPDATE staff SET active=0 WHERE id=?').run(staffId)
    return { ok: true }
  })

  // --- Dashboard (today, local time) ---
  ipcMain.handle('dash:today', () => {
    const today = "date(created_at)=date('now','localtime')"
    const sum = db.prepare(`SELECT COUNT(*) orders, COALESCE(SUM(total),0) gross FROM orders WHERE voided=0 AND ${today}`).get()
    const byMethod = db
      .prepare(`SELECT payment_method method, COUNT(*) n, COALESCE(SUM(total),0) amt FROM orders WHERE voided=0 AND ${today} GROUP BY payment_method ORDER BY amt DESC`)
      .all()
    const top = db
      .prepare(
        `SELECT oi.name, SUM(oi.qty) qty, SUM(oi.qty*oi.price) amt FROM order_items oi JOIN orders o ON o.id=oi.order_id
         WHERE o.voided=0 AND date(o.created_at)=date('now','localtime') GROUP BY oi.name ORDER BY qty DESC LIMIT 8`,
      )
      .all()
    const byStaff = db
      .prepare(`SELECT COALESCE(NULLIF(staff_name,''),'—') staff, COUNT(*) n, COALESCE(SUM(total),0) amt FROM orders WHERE voided=0 AND ${today} GROUP BY staff ORDER BY amt DESC`)
      .all()
    return { ...(sum as object), byMethod, top, byStaff }
  })

  // --- Orders list (today or all, optional search) ---
  ipcMain.handle('orders:list', (_e, opts: { scope?: 'today' | 'all'; q?: string }) => {
    const clauses: string[] = []
    const params: Record<string, string> = {}
    if ((opts?.scope ?? 'today') !== 'all') clauses.push("date(created_at)=date('now','localtime')")
    const q = (opts?.q ?? '').trim()
    if (q) {
      clauses.push('(CAST(token AS TEXT) LIKE @q OR customer_name LIKE @q OR payment_method LIKE @q OR staff_name LIKE @q)')
      params.q = `%${q}%`
    }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''
    return db
      .prepare(
        `SELECT id,token,total,payment_method,order_type,customer_name,staff_name,voided,synced,sync_error,created_at FROM orders ${where} ORDER BY id DESC LIMIT 200`,
      )
      .all(params)
  })

  // --- Restaurant: tables + open tabs (unpaid, fired to kitchen) ---
  ipcMain.handle('tables:list', () => {
    const opens = db.prepare('SELECT id,table_label,lines,updated_at FROM open_orders').all() as {
      id: number
      table_label: string
      lines: string
      updated_at: string
    }[]
    const byTable: Record<string, { id: number; items: number; total: number; updatedAt: string }> = {}
    for (const o of opens) {
      let ls: { qty?: number; price?: number }[] = []
      try {
        ls = JSON.parse(o.lines || '[]')
      } catch {
        /* ignore */
      }
      byTable[o.table_label] = {
        id: o.id,
        items: ls.reduce((s, l) => s + (l.qty || 0), 0),
        total: ls.reduce((s, l) => s + (l.price || 0) * (l.qty || 0), 0),
        updatedAt: o.updated_at,
      }
    }
    // Prefer the WordPress floor (opal-pos-connect); fall back to local table_count.
    const cached = getCachedTables(db)
    const floor: { label: string; area?: string; seats?: number }[] = cached.length
      ? cached.map((t) => ({ label: t.label, area: t.area || undefined, seats: t.seats || undefined }))
      : Array.from({ length: Number(getSettings(db).table_count) || 12 }, (_, i) => ({ label: `Table ${i + 1}` }))
    return floor.map((t) => ({ ...t, open: byTable[t.label] ?? null }))
  })
  ipcMain.handle('openorder:get', (_e, id: number) => {
    const o = db.prepare('SELECT * FROM open_orders WHERE id=?').get(id) as
      | { id: number; table_label: string; lines: string; note: string; customer_id: number | null; customer_name: string | null; staff_name: string | null }
      | undefined
    if (!o) return null
    let lines: unknown[] = []
    try {
      lines = JSON.parse(o.lines || '[]')
    } catch {
      /* ignore */
    }
    return { id: o.id, tableLabel: o.table_label, lines, note: o.note, customerId: o.customer_id, customerName: o.customer_name, staffName: o.staff_name }
  })
  ipcMain.handle('openorder:save', (_e, p: OpenOrderPayload) => ({ id: saveOpenOrder(db, p) }))
  ipcMain.handle('openorder:send', (_e, p: OpenOrderPayload) => {
    const lines = (p.lines ?? []) as (TicketItem & { price: number; sent?: boolean })[]
    const unsent = lines.filter((l) => !l.sent)
    const id = saveOpenOrder(db, { ...p, lines: lines.map((l) => ({ ...l, sent: true })) })
    if (unsent.length) {
      const byStation = printersOf(db)
      // One prepare ticket per station — front-of-house vs kitchen — each to its own
      // printer if configured, otherwise its own separate ticket on the counter.
      for (const [station, list] of Object.entries(routeByStation(unsent))) {
        const cfg = byStation[station] ?? byStation.counter
        if (cfg)
          void printKitchenWithRetry(
            cfg,
            buildKitchenTicket({ token: id, station: stationLabel(station), table: p.tableLabel ?? undefined, items: list, orderType: 'table', note: p.note ?? undefined }),
          )
      }
    }
    return { id, printed: unsent.length }
  })
  ipcMain.handle('openorder:close', (_e, id: number) => {
    db.prepare('DELETE FROM open_orders WHERE id=?').run(id)
    return { ok: true }
  })

  // --- Shift: start-of-day float + end-of-day summary ---
  const currentShift = () => db.prepare("SELECT * FROM shifts WHERE status='open' ORDER BY id DESC LIMIT 1").get() as ShiftRow | undefined
  const buildDayReport = (shift: ShiftRow): DayReport => {
    const s = computeShiftSummary(db, shift)
    const tf = { hour: 'numeric', minute: '2-digit', hour12: true } as const
    const closedIso = shift.closed_at ?? new Date().toISOString()
    return {
      shopName: getReceiptCfg(db).shopName,
      date: new Date(closedIso).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      openedAt: new Date(shift.opened_at).toLocaleTimeString('en-AU', tf),
      openedBy: shift.opened_by ?? '',
      closedAt: new Date(closedIso).toLocaleTimeString('en-AU', tf),
      closedBy: shift.closed_by ?? '',
      orders: s.orders,
      gross: s.gross,
      byMethod: s.byMethod,
      openingFloat: shift.opening_float || 0,
      cashSales: s.cashSales,
      cashExpected: s.cashExpected,
      countedCash: shift.counted_cash ?? null,
    }
  }
  ipcMain.handle('shift:current', () => currentShift() ?? null)
  ipcMain.handle('shift:open', (_e, openingFloat: number, staffName?: string) => {
    const existing = currentShift()
    if (existing) return existing
    const now = new Date().toISOString()
    const float = Number(openingFloat) || 0
    const info = db.prepare("INSERT INTO shifts (opened_at,opened_by,opening_float,status) VALUES (?,?,?,'open')").run(now, staffName ?? null, float)
    const byStation = printersOf(db)
    if (byStation.counter) {
      void printWithRetry(
        byStation.counter,
        `DAY STARTED\n${new Date().toLocaleString('en-AU')}\nOpening float: $${float.toFixed(2)}${staffName ? '\n' + staffName : ''}`,
        { kickDrawer: true },
      )
    }
    return db.prepare('SELECT * FROM shifts WHERE id=?').get(info.lastInsertRowid)
  })
  ipcMain.handle('shift:summary', () => {
    const shift = currentShift()
    return shift ? { shift, ...computeShiftSummary(db, shift) } : null
  })
  ipcMain.handle('shift:close', (_e, countedCash: number | null, staffName?: string) => {
    const shift = currentShift()
    if (!shift) return { ok: false }
    const now = new Date().toISOString()
    const counted = countedCash === null || countedCash === undefined || (countedCash as unknown) === '' ? null : Number(countedCash)
    db.prepare("UPDATE shifts SET status='closed', closed_at=?, closed_by=?, counted_cash=? WHERE id=?").run(now, staffName ?? null, counted, shift.id)
    const closed = db.prepare('SELECT * FROM shifts WHERE id=?').get(shift.id) as ShiftRow
    const report = buildDayReport(closed)
    const byStation = printersOf(db)
    if (byStation.counter) void printReportWithRetry(byStation.counter, report, { kickDrawer: true })
    return { ok: true, report }
  })
  ipcMain.handle('shift:list', () => {
    const rows = db.prepare("SELECT * FROM shifts WHERE status='closed' ORDER BY id DESC LIMIT 14").all() as ShiftRow[]
    return rows.map((r) => {
      const s = computeShiftSummary(db, r)
      return { id: r.id, openedAt: r.opened_at, closedAt: r.closed_at, orders: s.orders, gross: s.gross, openingFloat: r.opening_float || 0, countedCash: r.counted_cash ?? null }
    })
  })
  ipcMain.handle('shift:report', (_e, id: number) => {
    const shift = db.prepare('SELECT * FROM shifts WHERE id=?').get(id) as ShiftRow | undefined
    if (!shift) return { ok: false, printed: false }
    const report = buildDayReport(shift)
    const byStation = printersOf(db)
    if (byStation.counter) void printReportWithRetry(byStation.counter, report, { kickDrawer: false })
    return { ok: true, printed: !!byStation.counter }
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
        `INSERT INTO orders (token,status,subtotal,tax,discount,total,tender,change,payment_method,order_type,note,customer_id,customer_name,staff_name,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
        payload.staffName ?? null,
        new Date().toISOString(),
      )
    const oid = info.lastInsertRowid as number
    const insItem = db.prepare(
      `INSERT INTO order_items (order_id,product_id,name,qty,price,station,modifiers) VALUES (?,?,?,?,?,?,?)`,
    )
    for (const it of payload.items) {
      insItem.run(oid, it.product_id, it.name, it.qty, it.price, it.station, JSON.stringify(it.modifiers ?? []))
    }
    printReceiptAndTickets(
      db,
      token,
      payload.items,
      payload.totals,
      { orderType: payload.orderType, note: payload.note, customerName: payload.customerName, staffName: payload.staffName },
      !payload.openOrderId, // a dine-in tab was already fired via Send to Kitchen — don't reprint the prep tickets
    )
    if (payload.openOrderId) db.prepare('DELETE FROM open_orders WHERE id=?').run(payload.openOrderId)
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
      void printReceiptWithRetry(
        byStation.counter,
        {
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
          staffName: o.staff_name,
        },
        getReceiptCfg(db),
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
    // NOTE: auto-push of local sales is intentionally NOT in the background tick — a stuck
    // order here spawned a flood of blank $0 orders on the store. Pushing happens only on
    // the manual ↻ Sync now (which is capped + skips empty orders).
    try {
      const fresh = await pollOnline(db, sessionRef.current)
      for (const o of fresh) {
        printReceiptAndTickets(db, o.token, o.items, null)
        notify('online:new', { token: o.token, total: o.total, items: o.items.length })
      }
    } catch {
      /* offline */
    }
    try {
      const opal = await pollOpalOrders(db, sessionRef.current)
      for (const o of opal) {
        const staged = assignStations(db, o.items)
        mergeOpalTab(db, { ...o, items: staged })
        printReceiptAndTickets(db, o.token, staged, null, { table: o.table, note: o.note, orderType: 'table' })
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
