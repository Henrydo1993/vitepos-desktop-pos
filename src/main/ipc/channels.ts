import { ipcMain, app } from 'electron'
import { hashPin, verifyPin, isLegacyPin } from '../pin'
import type BetterSqlite3 from 'better-sqlite3'
import type { Session } from '../api/auth'
import { listMenu } from '../db/repo'
import { syncCatalog } from '../sync/catalog'
import { fetchVariations, searchCustomers, createCustomer, fetchReceiptConfig, fetchOpalTables } from '../api/client'
import { pushPending, reconcileDeletedOrders, settleOpalOrder, cancelOpalOrders, settlePendingOpal } from '../sync/orders'
import { pollOnline, pollOpalOrders, deliverOpalOrder, markOpalSeen, type OnlineOrder } from '../sync/online'
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
  totals: { subtotal: number; discount: number; tax: number; total: number; tender: number; change: number; fee?: number }
  paymentMethod?: string
  orderType?: string
  note?: string
  customerId?: number
  customerName?: string
  staffName?: string
  openOrderId?: number
  tableLabel?: string
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
  let cfg = DEFAULT_RECEIPT
  const row = db.prepare("SELECT value FROM meta WHERE key='cfg_receipt'").get() as { value?: string } | undefined
  if (row?.value) {
    try {
      cfg = JSON.parse(row.value) as ReceiptConfig
    } catch {
      /* fall through to default */
    }
  }
  // Australian business: always print the ABN in the header (replaces WooCommerce's "Vat No").
  return { ...cfg, vatRegLabel: 'ABN', vatReg: '66669980778', showVatReg: true }
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
  // Attribute by shift_id (precise — no orders-after-close leaking in, none missed). Orders
  // from before this feature have NULL shift_id, so fall back to the time window for those:
  // open shift = since it opened; closed shift = bounded to its close time.
  const win = shift.closed_at ? 'created_at >= ? AND created_at < ?' : 'created_at >= ?'
  const windowArgs: (string | number)[] = shift.closed_at ? [shift.opened_at, shift.closed_at] : [shift.opened_at]
  const cond = `(shift_id = ? OR (shift_id IS NULL AND ${win}))`
  const args: (string | number)[] = [shift.id, ...windowArgs]
  const sum = db.prepare(`SELECT COUNT(*) orders, COALESCE(SUM(total),0) gross FROM orders WHERE voided=0 AND ${cond}`).get(...args) as { orders: number; gross: number }
  const byMethod = db
    .prepare(`SELECT payment_method method, COUNT(*) n, COALESCE(SUM(total),0) amt FROM orders WHERE voided=0 AND ${cond} GROUP BY payment_method ORDER BY amt DESC`)
    .all(...args) as { method: string; n: number; amt: number }[]
  const cash = db.prepare(`SELECT COALESCE(SUM(total),0) c FROM orders WHERE voided=0 AND payment_method='cash' AND ${cond}`).get(...args) as { c: number }
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
    product_id: (it as { productId?: number }).productId ?? 0, // keep, so payment can settle this on WooCommerce
    name: it.name,
    price: it.price,
    qty: it.qty,
    station: it.station ?? 'kitchen',
    modifiers: it.modifiers ?? [],
    sent: true,
  }))
  const now = new Date().toISOString()
  const existing = db.prepare('SELECT id, lines, remote_ids FROM open_orders WHERE table_label=? ORDER BY id DESC LIMIT 1').get(o.table) as
    | { id: number; lines: string; remote_ids: string | null }
    | undefined
  if (existing) {
    let prev: unknown[] = []
    try {
      prev = JSON.parse(existing.lines || '[]')
    } catch {
      /* ignore */
    }
    // Track every origin WooCommerce order merged into this tab, so payment settles them all.
    let ids: number[] = []
    try {
      ids = JSON.parse(existing.remote_ids || '[]')
    } catch {
      /* ignore */
    }
    // Idempotent: if this WooCommerce order is already merged into the tab, do nothing. Without
    // this, re-processing the same order (an overlapping poll, a retry) re-appends the food and
    // silently double-bills the table.
    if (ids.includes(o.remoteId)) return
    ids.push(o.remoteId)
    db.prepare('UPDATE open_orders SET lines=?, remote_ids=?, updated_at=? WHERE id=?').run(JSON.stringify([...prev, ...lines]), JSON.stringify(ids), now, existing.id)
  } else {
    const who = o.source === 'waiter' ? 'Waiter' : 'QR order'
    db.prepare('INSERT INTO open_orders (table_label,order_type,note,staff_name,lines,remote_ids,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(
      o.table,
      'table',
      o.note ?? '',
      who,
      JSON.stringify(lines),
      JSON.stringify([o.remoteId]),
      now,
      now,
    )
  }
}

// Only one delivery pass may run at a time. Ticks fire every 15s AND the operator can hit Sync;
// because each order's kitchen ticket is now awaited, a busy pass can outlast the interval. Two
// overlapping passes would both fetch the same not-yet-seen orders and double-print/double-record,
// so a later pass simply skips while one is still draining (its orders are caught next tick).
let opalDelivering = false

// Poll the ordering-app (QR/waiter) orders and deliver each one robustly. This is the path that
// silently lost a whole dinner service. Three faults combined: (1) orders were marked "seen" the
// instant they were fetched — before printing — so any later hiccup lost them forever; (2) one
// throw aborted the entire batch; (3) every error was swallowed, so it failed invisibly. On top of
// that the prints were fire-and-forget: under a rush, dozens of concurrent TCP connections stormed
// the single-socket printer and it collapsed. Now: prints are serialized + awaited, an order is
// marked seen only after it's recorded on the floor, each order is isolated, and every failure
// (print, record, or the poll itself) raises a visible alert instead of vanishing.
async function deliverOpalBatch(db: BetterSqlite3.Database, session: Session, notify: Notify | null): Promise<void> {
  if (opalDelivering) return
  opalDelivering = true
  try {
    const msg = (e: unknown) => String((e as Error)?.message ?? e)
    let opal: OnlineOrder[]
    try {
      opal = await pollOpalOrders(db, session)
    } catch (e) {
      console.error('[opal] poll failed', e)
      notify?.('opal:pollfail', { error: msg(e) })
      return
    }
    for (const o of opal) {
      try {
        const staged = assignStations(db, o.items)
        await deliverOpalOrder(
          { ...o, items: staged },
          {
            record: (x) => mergeOpalTab(db, x),
            markSeen: (id) => markOpalSeen(db, id),
            print: (x) => printOpalTickets(db, x), // awaited + serialized per printer
            onReceived: (x) => notify?.('online:new', { token: x.token, total: x.total, items: x.items.length, table: x.table }),
            onPrintFail: (x, e) => {
              console.error('[opal] print failed for order', x.remoteId, e)
              notify?.('opal:printfail', { id: x.remoteId, table: x.table, error: msg(e) })
            },
          },
        )
      } catch (e) {
        // record/assign threw — the order was NOT marked seen, so the next poll (15s) retries it.
        console.error('[opal] failed to deliver order', o.remoteId, e)
        notify?.('opal:error', { id: o.remoteId, table: o.table, error: msg(e) })
      }
    }
  } finally {
    opalDelivering = false
  }
}

function printReceiptAndTickets(
  db: BetterSqlite3.Database,
  token: number,
  items: PricedItem[],
  totals: { subtotal: number; discount: number; tax: number; total: number; tender: number; change: number; fee?: number } | null,
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

// Kitchen tickets for ONE QR/waiter order, AWAITED (unlike printReceiptAndTickets, which fires and
// forgets). The delivery path awaits this so a genuine print failure actually propagates to the
// operator alert instead of vanishing into an un-awaited promise — and so mark-seen is meaningful.
// Prints are serialized per printer inside printKitchenWithRetry, so awaiting here can't storm it.
async function printOpalTickets(db: BetterSqlite3.Database, o: OnlineOrder): Promise<void> {
  const byStation = printersOf(db)
  const routed = Object.entries(routeByStation(o.items))
  if (routed.length === 0) return
  for (const [station, list] of routed) {
    const cfg = byStation[station] ?? byStation.counter
    if (!cfg) throw new Error(`no printer configured for station "${station}" (and no counter fallback)`)
    await printKitchenWithRetry(cfg, buildKitchenTicket({ token: o.token, station: stationLabel(station), table: o.table, items: list, orderType: 'table', note: o.note }))
  }
}

export function registerIpc(db: BetterSqlite3.Database, sessionRef: SessionRef, rebuildSession: () => void) {
  void cacheOpalTables(db, sessionRef.current) // pull the WordPress floor once on startup

  // --- Role enforcement (server-side, not just UI) -----------------------------------------
  // The renderer reports who unlocked the till (auth:setStaff). Privileged handlers verify the
  // role here so a bypassed UI can't void sales, read/write credentials, or manage staff.
  const ROLE_RANK: Record<string, number> = { staff: 0, cashier: 0, server: 0, manager: 1, admin: 2, owner: 2 }
  const currentStaff: { current: { id: number; name: string; role: string } | null } = { current: null }
  const staffCount = () => (db.prepare('SELECT COUNT(*) n FROM staff WHERE active=1').get() as { n: number }).n
  const MANAGER = 1
  const ADMIN = 2
  function requireRole(min: number, allowFirstRun = false): void {
    if (allowFirstRun && staffCount() === 0) return // first-run setup, before any staff exists
    const rank = ROLE_RANK[currentStaff.current?.role ?? ''] ?? -1
    if (rank < min) throw new Error(min >= ADMIN ? 'Admin only — please have an admin sign in.' : 'Manager or admin only — please have one sign in.')
  }
  ipcMain.handle('auth:setStaff', (_e, staff: { id: number; name: string; role: string } | null) => {
    currentStaff.current = staff ?? null
    return { ok: true }
  })

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
    await settlePendingOpal(db, sessionRef.current).catch(() => ({ settled: 0 })) // retry QR/waiter settles that were offline at payment
    const recon = await reconcileDeletedOrders(db, sessionRef.current).catch(() => ({ removed: 0 }))
    try {
      const fresh = await pollOnline(db, sessionRef.current)
      for (const o of fresh) printReceiptAndTickets(db, o.token, o.items, null)
    } catch {
      /* offline */
    }
    // Manual sync has no renderer channel to notify (its result is returned to the caller),
    // so failures surface via console only; the background tick does the live toasting.
    await deliverOpalBatch(db, sessionRef.current, null)
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

  // --- Local unlock PIN (salted scrypt in meta; unlocks the till without the WP password) ---
  const pinHash = () => (db.prepare("SELECT value FROM meta WHERE key='pin_hash'").get() as { value?: string } | undefined)?.value
  const setPinHash = (h: string) => db.prepare("INSERT INTO meta (key,value) VALUES ('pin_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(h)
  ipcMain.handle('pin:status', () => ({ set: !!pinHash() }))
  ipcMain.handle('pin:set', (_e, pin: string) => {
    setPinHash(hashPin(String(pin)))
    return { ok: true }
  })
  ipcMain.handle('pin:verify', (_e, pin: string) => {
    const h = pinHash()
    if (!h || !verifyPin(String(pin), h)) return { ok: false }
    if (isLegacyPin(h)) setPinHash(hashPin(String(pin))) // upgrade the old unsalted hash on use
    return { ok: true }
  })

  // --- Staff / multi-user sign-in (salted scrypt PINs; a legacy single PIN becomes "Manager") ---
  const nowIso = () => new Date().toISOString()
  {
    const legacy = pinHash()
    const count = (db.prepare('SELECT COUNT(*) c FROM staff').get() as { c: number }).c
    if (legacy && count === 0)
      db.prepare("INSERT INTO staff (name,pin_hash,role,active,created_at) VALUES ('Manager',?,'manager',1,?)").run(legacy, nowIso())
  }
  ipcMain.handle('staff:list', () => db.prepare('SELECT id,name,role FROM staff WHERE active=1 ORDER BY id').all())
  ipcMain.handle('staff:add', (_e, name: string, pin: string, role: string) => {
    requireRole(ADMIN, true) // managing staff/PINs — admin only (allow the first staff at setup)
    const info = db
      .prepare('INSERT INTO staff (name,pin_hash,role,active,created_at) VALUES (?,?,?,1,?)')
      .run(String(name).trim() || 'Staff', hashPin(String(pin)), role || 'staff', nowIso())
    return { ok: true, id: Number(info.lastInsertRowid) }
  })
  ipcMain.handle('staff:verify', (_e, staffId: number, pin: string) => {
    const row = db.prepare('SELECT id,name,role,pin_hash FROM staff WHERE id=? AND active=1').get(staffId) as
      | { id: number; name: string; role: string; pin_hash: string }
      | undefined
    if (!row || !verifyPin(String(pin), row.pin_hash)) return { ok: false }
    if (isLegacyPin(row.pin_hash)) db.prepare('UPDATE staff SET pin_hash=? WHERE id=?').run(hashPin(String(pin)), row.id) // upgrade on use
    return { ok: true, staff: { id: row.id, name: row.name, role: row.role } }
  })
  ipcMain.handle('staff:remove', (_e, staffId: number) => {
    requireRole(ADMIN) // admin only
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
        `SELECT id,token,total,payment_method,order_type,customer_name,staff_name,voided,synced,sync_error,created_at,table_label FROM orders ${where} ORDER BY id DESC LIMIT 200`,
      )
      .all(params)
  })

  // Full detail of one past order — every line item + totals — so staff can look back at a
  // finished order to check what was actually rung up (e.g. to trace a mistake).
  ipcMain.handle('order:get', (_e, id: number) => {
    const o = db
      .prepare(
        'SELECT id,token,status,subtotal,tax,discount,total,tender,change,fee,payment_method,order_type,note,customer_name,staff_name,voided,void_reason,created_at,table_label FROM orders WHERE id=?',
      )
      .get(id) as Record<string, unknown> | undefined
    if (!o) return null
    const items = (
      db.prepare('SELECT name,qty,price,station,modifiers FROM order_items WHERE order_id=? ORDER BY id').all(id) as {
        name: string
        qty: number
        price: number
        station: string
        modifiers: string
      }[]
    ).map((it) => ({ name: it.name, qty: it.qty, price: it.price, station: it.station, modifiers: JSON.parse(it.modifiers || '[]') as string[] }))
    return { ...o, items }
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
  // Re-print the kitchen PREPARE list for a currently-serving tab, e.g. when the original
  // ticket was lost or jammed. Prints only the prep tickets (no receipt); serialized per
  // printer like every other print, so it can't storm a busy printer.
  ipcMain.handle('openorder:reprintPrepare', (_e, id: number) => {
    const o = db.prepare('SELECT id,table_label,lines,note FROM open_orders WHERE id=?').get(id) as
      | { id: number; table_label: string; lines: string; note: string | null }
      | undefined
    if (!o) throw new Error('This table has no open order.')
    let lines: PricedItem[] = []
    try {
      lines = JSON.parse(o.lines || '[]')
    } catch {
      /* ignore */
    }
    if (!lines.length) throw new Error('Nothing to print — this table has no items yet.')
    printReceiptAndTickets(db, o.id, lines, null, { table: o.table_label, note: o.note ?? undefined, orderType: 'table' })
    return { ok: true, stations: [...new Set(lines.map((l) => l.station ?? 'kitchen'))] }
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
    // A tab cleared/cancelled unpaid: if it came from QR/waiter orders, cancel those on
    // WooCommerce too (so no "processing" order dangles). Pay goes through order:commit,
    // never here, so this can't cancel a just-settled order.
    const tab = db.prepare('SELECT remote_ids FROM open_orders WHERE id=?').get(id) as { remote_ids: string | null } | undefined
    let remoteIds: number[] = []
    try {
      remoteIds = JSON.parse(tab?.remote_ids || '[]')
    } catch {
      /* walk-in tab */
    }
    db.prepare('DELETE FROM open_orders WHERE id=?').run(id)
    if (remoteIds.length) void cancelOpalOrders(sessionRef.current, remoteIds).catch(() => undefined)
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
    requireRole(ADMIN, true) // settings hold the WooCommerce credentials — admin only (allow first-run)
    saveSettings(db, patch)
    seedPrintersFromSettings(db, getSettings(db))
    rebuildSession()
    return { ok: true }
  })

  ipcMain.handle('order:commit', (_e, payload: CommitPayload) => {
    const token = (
      db.prepare(`SELECT COALESCE(MAX(token),0)+1 t FROM orders WHERE date(created_at)=date('now')`).get() as { t: number }
    ).t
    // Tie the sale to the open shift (0 = none open) so reports attribute it precisely.
    const shiftId = (db.prepare("SELECT id FROM shifts WHERE status='open' ORDER BY id DESC LIMIT 1").get() as { id?: number } | undefined)?.id ?? 0
    // Record which table a dine-in order was on, so past-order details can show it. Prefer the
    // label the till sends; otherwise read it off the open tab being settled (before it's deleted).
    let tableLabel: string | null = payload.tableLabel ?? null
    if (!tableLabel && payload.openOrderId) {
      const oo = db.prepare('SELECT table_label FROM open_orders WHERE id=?').get(payload.openOrderId) as { table_label?: string } | undefined
      tableLabel = oo?.table_label ?? null
    }
    const info = db
      .prepare(
        `INSERT INTO orders (token,status,subtotal,tax,discount,total,tender,change,fee,payment_method,order_type,note,customer_id,customer_name,staff_name,shift_id,created_at,table_label)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
        payload.totals.fee ?? 0,
        payload.paymentMethod ?? 'cash',
        payload.orderType ?? 'takeaway',
        payload.note ?? '',
        payload.customerId ?? null,
        payload.customerName ?? null,
        payload.staffName ?? null,
        shiftId,
        new Date().toISOString(),
        tableLabel,
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
    if (payload.openOrderId) {
      // If this tab came from QR/waiter orders, settle those SAME WooCommerce orders
      // (complete + paid + final items) instead of creating a duplicate. The local order
      // stays for POS reports but is flagged synced so pushPending never re-sends it.
      const tab = db.prepare('SELECT remote_ids FROM open_orders WHERE id=?').get(payload.openOrderId) as { remote_ids: string | null } | undefined
      let remoteIds: number[] = []
      try {
        remoteIds = JSON.parse(tab?.remote_ids || '[]')
      } catch {
        /* walk-in tab — no origin orders */
      }
      if (remoteIds.length) {
        db.prepare('UPDATE orders SET synced=1, opal_remote_ids=?, opal_settled=0, remote_id=? WHERE id=?').run(JSON.stringify(remoteIds), remoteIds[0], oid)
        const items = payload.items.map((it) => ({ product_id: it.product_id, name: it.name, qty: it.qty }))
        const method = payload.paymentMethod ?? 'cash'
        void settleOpalOrder(sessionRef.current, remoteIds, items, { method, title: `${method} (POS)` })
          .then((res) => {
            if (res.ok) db.prepare('UPDATE orders SET opal_settled=1, remote_id=? WHERE id=?').run(res.settledId ?? remoteIds[0], oid)
          })
          .catch(() => undefined)
      }
      db.prepare('DELETE FROM open_orders WHERE id=?').run(payload.openOrderId)
    }
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
          fee: o.fee,
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
    requireRole(MANAGER) // voiding a sale is a theft vector — manager/admin only
    db.prepare(`UPDATE orders SET voided=1, void_reason=?, status='cancelled', synced=0 WHERE id=?`).run(reason, orderId)
    return { ok: true }
  })

  ipcMain.handle('order:setPayment', (_e, orderId: number, method: string) => {
    requireRole(MANAGER) // correcting a payment record reclassifies cash vs card — manager/admin only
    if (!['cash', 'card', 'bank', 'other'].includes(method)) throw new Error('Invalid payment method')
    // Local reclassification only — does NOT re-sync (would risk a duplicate on the store).
    db.prepare('UPDATE orders SET payment_method=? WHERE id=?').run(method, orderId)
    return { ok: true }
  })
}

// Background loop: push local orders to WooCommerce and pull website orders to the kitchen.
export function startSync(db: BetterSqlite3.Database, sessionRef: SessionRef, notify: Notify) {
  const tick = async () => {
    // Auto-push of local sales is intentionally NOT in the background tick. Re-enabling it
    // dumped the whole un-synced backlog onto the store as a burst of surprise orders (and
    // originally spawned a $0-order flood). Pushing happens ONLY on the manual ↻ Sync, which
    // the operator triggers deliberately (capped + skips empty orders).
    try {
      const fresh = await pollOnline(db, sessionRef.current)
      for (const o of fresh) {
        printReceiptAndTickets(db, o.token, o.items, null)
        notify('online:new', { token: o.token, total: o.total, items: o.items.length })
      }
    } catch {
      /* offline */
    }
    await deliverOpalBatch(db, sessionRef.current, notify)
  }
  const interval = Number(process.env.SYNC_INTERVAL_MS ?? 15000)
  setInterval(() => void tick(), interval)
  void tick()
}
