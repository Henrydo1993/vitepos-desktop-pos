# Vitepos Desktop POS — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single-terminal Windows POS (Electron) that logs into the live Vitepos/WooCommerce site, mirrors the menu locally, takes a pay-first counter order, prints receipt + kitchen + bar tickets via raw ESC/POS, and records cash — all local-first so slow/down internet never blocks the counter.

**Architecture:** Electron app. **Main process** (Node) owns the SQLite mirror, the ESC/POS print engine, and the Vitepos API client; **renderer** (React/TS) is the touch order UI and talks to main over typed IPC. Catalog syncs server→local; orders are written locally first (Phase 2 adds server push).

**Tech Stack:** Electron + electron-vite, React + TypeScript, `better-sqlite3`, `node-thermal-printer`, `axios` + `tough-cookie` (WP cookie/nonce auth), `vitest` for tests.

**Scope note:** This plan is **Phase 1 only** (see `docs/superpowers/specs/2026-07-05-vitepos-desktop-pos-design.md` §15). Phases 2 (offline queue + WooCommerce push + online-orders-to-kitchen + card terminal), 3 (kiosk + auto-update), and 4 (extra modules) get their own plans after Phase 1 runs.

---

## Prerequisites (execution-time, from the user)

Before Task 3 you need three secrets. Put them in a local `.env` (git-ignored):

```
VITEPOS_BASE_URL=https://YOUR-LIVE-SITE.com
VITEPOS_POS_USER=the-pos-wordpress-username
VITEPOS_POS_PASS=the-pos-wordpress-password
VITEPOS_OUTLET=1        # outlet_id from Vitepos admin
VITEPOS_COUNTER=1       # counter_id from Vitepos admin
```

Live-site guardrails (spec §17): use a test product/category + test customer, and disable customer order emails in Vitepos while running smoke tests.

---

## File Structure

```
vitepos-desktop-pos/
├─ electron.vite.config.ts        # build config (main/preload/renderer)
├─ package.json
├─ .env                            # secrets (git-ignored)
├─ src/
│  ├─ main/
│  │  ├─ index.ts                  # app bootstrap, window, IPC registration
│  │  ├─ db/
│  │  │  ├─ connection.ts          # better-sqlite3 handle + PRAGMAs
│  │  │  ├─ schema.ts              # CREATE TABLE migrations
│  │  │  └─ repo.ts                # typed read/write helpers
│  │  ├─ api/
│  │  │  ├─ auth.ts                # login, cookie+nonce store
│  │  │  └─ client.ts              # typed Vitepos endpoints + Vite-Outlet header
│  │  ├─ sync/
│  │  │  └─ catalog.ts             # pull catalog → normalize → upsert
│  │  ├─ print/
│  │  │  ├─ tickets.ts             # pure ESC/POS ticket builders (testable)
│  │  │  ├─ router.ts              # split order lines by station
│  │  │  └─ engine.ts              # print queue, retry, ACK/fail events, drawer kick
│  │  ├─ order/
│  │  │  └─ pricing.ts             # local money math (menu price + discount + tax)
│  │  └─ ipc/
│  │     └─ channels.ts            # typed IPC handler registration
│  ├─ preload/
│  │  └─ index.ts                  # contextBridge: expose typed `window.pos`
│  └─ renderer/
│     └─ src/
│        ├─ App.tsx
│        ├─ types.ts               # shared DTOs (mirrors main)
│        ├─ state/cart.ts          # cart + held-orders store (zustand)
│        └─ components/
│           ├─ MenuGrid.tsx        # categories + product tiles
│           ├─ ModifierModal.tsx   # addon selection
│           ├─ CartPanel.tsx       # line items, totals, hold/recall
│           └─ PayModal.tsx        # cash tender → confirm → fire prints
├─ tests/
│  ├─ pricing.test.ts
│  ├─ tickets.test.ts
│  ├─ router.test.ts
│  └─ catalog.test.ts
├─ scripts/
│  └─ probe-api.ts                 # Task 1: capture live API contract → fixtures
└─ fixtures/                       # real API responses captured from live
```

---

## Task 0: Scaffold Electron + React + TS

**Files:** whole project via scaffolder, then prune.

- [ ] **Step 1: Scaffold with electron-vite (React + TS template)**

Run in the project root (`vitepos-desktop-pos/`):
```bash
npm create @quick-start/electron@latest . -- --template react-ts
npm install
```
Expected: creates `src/main`, `src/preload`, `src/renderer`, `electron.vite.config.ts`, runnable via `npm run dev`.

- [ ] **Step 2: Add runtime + dev dependencies**

```bash
npm install better-sqlite3 node-thermal-printer axios tough-cookie axios-cookiejar-support dotenv zustand
npm install -D vitest @types/better-sqlite3 @electron/rebuild tsx
npx electron-rebuild -f -w better-sqlite3
```
(`electron-rebuild` compiles `better-sqlite3` against Electron's Node ABI — required or it will not load in main.)

- [ ] **Step 3: Add test + probe scripts to package.json**

In `package.json` `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest",
"probe": "tsx scripts/probe-api.ts"
```

- [ ] **Step 4: Verify the shell runs**

Run: `npm run dev`
Expected: an Electron window opens with the template page. Close it.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold electron-vite react-ts + deps"
```

---

## Task 1: Capture the live Vitepos API contract

We build against **real** response shapes, not guesses. This script logs into the live site and saves raw JSON to `fixtures/`.

**Files:** Create `scripts/probe-api.ts`; output `fixtures/*.json`.

- [ ] **Step 1: Write the probe script**

`scripts/probe-api.ts`:
```ts
import 'dotenv/config'
import axios from 'axios'
import { CookieJar } from 'tough-cookie'
import { wrapper } from 'axios-cookiejar-support'
import { writeFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.VITEPOS_BASE_URL!
const NS = '/wp-json/vitepos/v1'   // confirm namespace in Step 3 if 404
const jar = new CookieJar()
const http = wrapper(axios.create({ jar, baseURL: BASE, validateStatus: () => true }))

function save(name: string, data: unknown) {
  mkdirSync('fixtures', { recursive: true })
  writeFileSync(`fixtures/${name}.json`, JSON.stringify(data, null, 2))
  console.log(`saved fixtures/${name}.json`)
}

async function main() {
  const login = await http.post(`${NS}/user/user_login`, {
    user_login: process.env.VITEPOS_POS_USER,
    user_pass: process.env.VITEPOS_POS_PASS,
  })
  save('login', { status: login.status, data: login.data })

  const nonce = login.data?.data?.nonce ?? login.data?.nonce ?? ''
  const outletHeader = `${process.env.VITEPOS_OUTLET}|${process.env.VITEPOS_COUNTER}`
  const h = { 'X-WP-Nonce': nonce, 'vite-outlet': outletHeader }

  save('current_user', (await http.get(`${NS}/current_user`, { headers: h })).data)
  save('categories', (await http.post(`${NS}/product/all_categories`, { limit: 100 }, { headers: h })).data)
  save('products', (await http.post(`${NS}/product/product_list`, { limit: 20, page: 1 }, { headers: h })).data)
  save('taxes', (await http.get(`${NS}/all_taxes`, { headers: h })).data)
  save('online_orders', (await http.post(`${NS}/order/online_order_list`, { limit: 5 }, { headers: h })).data)
}
main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Run the probe against the live site**

Run: `npm run probe`
Expected: `fixtures/login.json` etc. written. **If any call returns 404**, the route base differs — open `fixtures/login.json` and adjust `NS` / sub-paths (readable API classes register routes as `<api_base>/<route>`, e.g. product routes under `/product/...`). Re-run until all fixtures contain real data (status 200, populated `data`).

- [ ] **Step 3: Record the contract**

At the top of `scripts/probe-api.ts`, note as comments the confirmed login field names, where the **nonce** lives, and the product/category/tax JSON shape (id, name, price, sku, category ids, variations, tax rate). These drive Tasks 3–4.

- [ ] **Step 4: Commit (fixtures only, never .env)**

```bash
git add scripts/probe-api.ts fixtures package.json package-lock.json
git commit -m "feat: probe + capture live Vitepos API contract"
```

---

## Task 2: SQLite schema + repo

**Files:** Create `src/main/db/connection.ts`, `src/main/db/schema.ts`, `src/main/db/repo.ts`; Test `tests/catalog.test.ts`.

- [ ] **Step 1: Write connection**

`src/main/db/connection.ts`:
```ts
import Database from 'better-sqlite3'
export function openDb(path: string): Database.Database {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}
```

- [ ] **Step 2: Write schema (one prepared statement per table)**

`src/main/db/schema.ts`:
```ts
import type Database from 'better-sqlite3'

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, parent_id INTEGER, station TEXT )`,
  `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, sku TEXT,
      price REAL NOT NULL, category_id INTEGER, tax_class TEXT, hidden INTEGER DEFAULT 0 )`,
  `CREATE TABLE IF NOT EXISTS modifiers (
      id INTEGER PRIMARY KEY, product_id INTEGER, name TEXT, price REAL DEFAULT 0 )`,
  `CREATE TABLE IF NOT EXISTS taxes (
      tax_class TEXT PRIMARY KEY, rate REAL NOT NULL )`,
  // station: counter|kitchen|bar ; type: epson|star ; address: tcp://ip or usb path
  `CREATE TABLE IF NOT EXISTS printers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, station TEXT NOT NULL,
      type TEXT NOT NULL, address TEXT NOT NULL )`,
  `CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, token INTEGER, status TEXT NOT NULL,
      subtotal REAL, tax REAL, discount REAL, total REAL, tender REAL, change REAL,
      created_at TEXT NOT NULL, synced INTEGER DEFAULT 0, remote_id INTEGER )`,
  `CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL,
      product_id INTEGER, name TEXT, qty INTEGER, price REAL, station TEXT,
      modifiers TEXT, FOREIGN KEY(order_id) REFERENCES orders(id) )`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`,
]

export function migrate(db: Database.Database) {
  const run = db.transaction(() => { for (const sql of STATEMENTS) db.prepare(sql).run() })
  run()
}
```

- [ ] **Step 3: Write the schema round-trip test**

`tests/catalog.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { openDb } from '../src/main/db/connection'
import { migrate } from '../src/main/db/schema'

describe('schema', () => {
  it('stores and reads a product', () => {
    const db = openDb(':memory:')
    migrate(db)
    db.prepare('INSERT INTO products (id,name,price,category_id) VALUES (?,?,?,?)').run(1, 'Latte', 5.5, 10)
    const row = db.prepare('SELECT name, price FROM products WHERE id=1').get() as any
    expect(row).toEqual({ name: 'Latte', price: 5.5 })
  })
})
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- catalog`
Expected: PASS.

- [ ] **Step 5: Write repo helpers**

`src/main/db/repo.ts`:
```ts
import type Database from 'better-sqlite3'
export const upsertCategory = (db: Database.Database, c: {id:number;name:string;parent_id?:number|null;station?:string|null}) =>
  db.prepare(`INSERT INTO categories (id,name,parent_id,station) VALUES (@id,@name,@parent_id,@station)
    ON CONFLICT(id) DO UPDATE SET name=@name, parent_id=@parent_id, station=@station`)
    .run({ parent_id: null, station: null, ...c })
export const upsertProduct = (db: Database.Database, p: {id:number;name:string;sku?:string|null;price:number;category_id?:number|null;tax_class?:string|null;hidden?:number}) =>
  db.prepare(`INSERT INTO products (id,name,sku,price,category_id,tax_class,hidden) VALUES (@id,@name,@sku,@price,@category_id,@tax_class,@hidden)
    ON CONFLICT(id) DO UPDATE SET name=@name, sku=@sku, price=@price, category_id=@category_id, tax_class=@tax_class, hidden=@hidden`)
    .run({ sku: null, category_id: null, tax_class: null, hidden: 0, ...p })
export const listMenu = (db: Database.Database) =>
  db.prepare(`SELECT * FROM products WHERE hidden=0 ORDER BY name`).all()
```

- [ ] **Step 6: Commit**

```bash
git add src/main/db tests/catalog.test.ts && git commit -m "feat: sqlite schema + repo"
```

---

## Task 3: API client (auth + Vite-Outlet header)

**Files:** Create `src/main/api/auth.ts`, `src/main/api/client.ts`. Use the field/nonce names **confirmed in Task 1 fixtures**; the code below assumes `login.data.data.nonce` — adjust to match your fixture.

- [ ] **Step 1: Write auth module**

`src/main/api/auth.ts`:
```ts
import axios, { AxiosInstance } from 'axios'
import { CookieJar } from 'tough-cookie'
import { wrapper } from 'axios-cookiejar-support'

export interface Session { http: AxiosInstance; nonce: string }

export async function login(baseURL: string, user: string, pass: string, outlet: string): Promise<Session> {
  const jar = new CookieJar()
  const http = wrapper(axios.create({ jar, baseURL, validateStatus: () => true }))
  const res = await http.post('/wp-json/vitepos/v1/user/user_login', { user_login: user, user_pass: pass })
  if (res.status !== 200 || !res.data?.status) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.data)}`)
  const nonce: string = res.data?.data?.nonce ?? ''
  http.defaults.headers.common['X-WP-Nonce'] = nonce
  http.defaults.headers.common['vite-outlet'] = outlet
  return { http, nonce }
}
```

- [ ] **Step 2: Write typed client**

`src/main/api/client.ts`:
```ts
import type { Session } from './auth'
const NS = '/wp-json/vitepos/v1'
export async function fetchCategories(s: Session) {
  return (await s.http.post(`${NS}/product/all_categories`, { limit: 500 })).data?.data
}
export async function fetchProducts(s: Session, page = 1, limit = 100) {
  return (await s.http.post(`${NS}/product/product_list`, { page, limit })).data?.data
}
export async function fetchTaxes(s: Session) {
  return (await s.http.get(`${NS}/all_taxes`)).data?.data
}
```

- [ ] **Step 3: Manual live check**

Add a temporary `scripts/check-client.ts` that calls `login(...)` then `fetchProducts(...)` with `.env` creds and logs the first product. Run `tsx scripts/check-client.ts`. Expected: prints a real product `{id,name,price,...}`. Delete the temp script after.

- [ ] **Step 4: Commit**

```bash
git add src/main/api && git commit -m "feat: vitepos api client with cookie/nonce auth + outlet header"
```

---

## Task 4: Catalog sync

**Files:** Create `src/main/sync/catalog.ts`; extend `tests/catalog.test.ts`.

- [ ] **Step 1: Write normalize + sync (map live shapes → repo; adjust field names to Task-1 fixtures)**

`src/main/sync/catalog.ts`:
```ts
import type Database from 'better-sqlite3'
import type { Session } from '../api/auth'
import { fetchCategories, fetchProducts, fetchTaxes } from '../api/client'
import { upsertCategory, upsertProduct } from '../db/repo'

export function normalizeProduct(raw: any) {
  return {
    id: Number(raw.id ?? raw.product_id),
    name: String(raw.name ?? raw.title),
    sku: raw.sku ?? null,
    price: Number(raw.price ?? raw.regular_price ?? 0),
    category_id: Number(raw.category_id ?? raw.categories?.[0]?.id ?? 0) || null,
    tax_class: raw.tax_class ?? null,
    hidden: raw.pos_hide ? 1 : 0,
  }
}

export async function syncCatalog(db: Database.Database, s: Session) {
  const cats = (await fetchCategories(s)) ?? []
  const insCats = db.transaction((rows: any[]) => rows.forEach(c =>
    upsertCategory(db, { id: Number(c.id), name: String(c.name), parent_id: Number(c.parent ?? 0) || null })))
  insCats(cats)

  let page = 1, total = 0
  for (;;) {
    const res = await fetchProducts(s, page, 100)
    const rows: any[] = res?.rowdata ?? res ?? []
    if (!rows.length) break
    const ins = db.transaction((rs: any[]) => rs.forEach(p => upsertProduct(db, normalizeProduct(p))))
    ins(rows); total += rows.length
    if (rows.length < 100) break
    page++
  }
  const taxes = (await fetchTaxes(s)) ?? []
  const insTax = db.transaction((rows: any[]) => rows.forEach((t: any) =>
    db.prepare(`INSERT INTO taxes (tax_class,rate) VALUES (?,?) ON CONFLICT(tax_class) DO UPDATE SET rate=excluded.rate`)
      .run(String(t.tax_class ?? t.slug ?? 'standard'), Number(t.rate ?? 0))))
  insTax(taxes)
  db.prepare(`INSERT INTO meta (key,value) VALUES ('last_sync',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
    .run(new Date().toISOString())
  return { products: total, categories: cats.length }
}
```

- [ ] **Step 2: Write the normalize test**

Append to `tests/catalog.test.ts`:
```ts
import { normalizeProduct } from '../src/main/sync/catalog'
it('normalizes a product from live shape', () => {
  const n = normalizeProduct({ id: 7, name: 'Flat White', price: '4.50', categories: [{ id: 3 }] })
  expect(n).toEqual({ id: 7, name: 'Flat White', sku: null, price: 4.5, category_id: 3, tax_class: null, hidden: 0 })
})
```

- [ ] **Step 3: Run — expect PASS**

Run: `npm test -- catalog`
Expected: both tests PASS. (If the live product shape differs, fix `normalizeProduct` and the test together using your fixture.)

- [ ] **Step 4: Commit**

```bash
git add src/main/sync tests/catalog.test.ts && git commit -m "feat: catalog sync server->local"
```

---

## Task 5: Local pricing (money-critical, TDD first)

**Files:** Create `src/main/order/pricing.ts`; Test `tests/pricing.test.ts`.

- [ ] **Step 1: Write failing pricing tests**

`tests/pricing.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { priceOrder } from '../src/main/order/pricing'

const line = (price: number, qty: number) => ({ price, qty, taxRate: 0.1 })
describe('priceOrder', () => {
  it('sums lines, applies tax after order discount', () => {
    const r = priceOrder([line(5, 2), line(3, 1)], { type: 'flat', value: 3 })
    expect(r).toEqual({ subtotal: 13, discount: 3, tax: 1, total: 11 })
  })
  it('percent discount + rounds to cents', () => {
    const r = priceOrder([line(4.5, 1)], { type: 'percent', value: 10 })
    expect(r).toEqual({ subtotal: 4.5, discount: 0.45, tax: 0.41, total: 4.46 })
  })
  it('no discount', () => {
    expect(priceOrder([line(2, 3)], null)).toEqual({ subtotal: 6, discount: 0, tax: 0.6, total: 6.6 })
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- pricing`
Expected: FAIL (`priceOrder` not defined).

- [ ] **Step 3: Implement pricing**

`src/main/order/pricing.ts`:
```ts
export interface PriceLine { price: number; qty: number; taxRate: number }
export type Discount = { type: 'flat' | 'percent'; value: number } | null
const cents = (n: number) => Math.round(n * 100) / 100

export function priceOrder(lines: PriceLine[], discount: Discount) {
  const subtotal = cents(lines.reduce((s, l) => s + l.price * l.qty, 0))
  let disc = 0
  if (discount) disc = discount.type === 'flat' ? discount.value : subtotal * (discount.value / 100)
  disc = cents(Math.min(disc, subtotal))
  const netByRate = new Map<number, number>()
  const factor = subtotal > 0 ? (subtotal - disc) / subtotal : 0
  for (const l of lines) {
    const net = l.price * l.qty * factor
    netByRate.set(l.taxRate, (netByRate.get(l.taxRate) ?? 0) + net)
  }
  let tax = 0
  for (const [rate, net] of netByRate) tax += net * rate
  tax = cents(tax)
  return { subtotal, discount: disc, tax, total: cents(subtotal - disc + tax) }
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- pricing`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/order/pricing.ts tests/pricing.test.ts && git commit -m "feat: local order pricing (tax after discount)"
```

---

## Task 6: Print engine — ticket builders + router (TDD), then queue

**Files:** Create `src/main/print/tickets.ts`, `src/main/print/router.ts`, `src/main/print/engine.ts`; Test `tests/tickets.test.ts`, `tests/router.test.ts`.

- [ ] **Step 1: Write failing router test**

`tests/router.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { routeByStation } from '../src/main/print/router'
describe('routeByStation', () => {
  it('splits food to kitchen, drink to bar', () => {
    const items = [
      { name: 'Burger', qty: 1, station: 'kitchen' },
      { name: 'Cola', qty: 2, station: 'bar' },
      { name: 'Fries', qty: 1, station: 'kitchen' },
    ]
    expect(routeByStation(items)).toEqual({
      kitchen: [{ name: 'Burger', qty: 1, station: 'kitchen' }, { name: 'Fries', qty: 1, station: 'kitchen' }],
      bar: [{ name: 'Cola', qty: 2, station: 'bar' }],
    })
  })
})
```

- [ ] **Step 2: Run — expect FAIL.** Run: `npm test -- router` → FAIL.

- [ ] **Step 3: Implement router**

`src/main/print/router.ts`:
```ts
export interface TicketItem { name: string; qty: number; station: string; modifiers?: string[] }
export function routeByStation(items: TicketItem[]): Record<string, TicketItem[]> {
  const out: Record<string, TicketItem[]> = {}
  for (const it of items) {
    const st = it.station || 'kitchen'
    ;(out[st] ??= []).push(it)
  }
  return out
}
```

- [ ] **Step 4: Run — expect PASS.** `npm test -- router` → PASS.

- [ ] **Step 5: Write failing ticket-builder test**

`tests/tickets.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildKitchenTicket } from '../src/main/print/tickets'
describe('buildKitchenTicket', () => {
  it('lists qty x name + token, no prices', () => {
    const t = buildKitchenTicket({ token: 42, station: 'KITCHEN', items: [{ name: 'Burger', qty: 2, station: 'kitchen', modifiers: ['no onion'] }] })
    expect(t).toContain('TOKEN #42')
    expect(t).toContain('2 x Burger')
    expect(t).toContain('no onion')
    expect(t).not.toContain('$')
  })
})
```

- [ ] **Step 6: Run — expect FAIL.** `npm test -- tickets` → FAIL.

- [ ] **Step 7: Implement ticket builders (plain-text bodies; engine adds ESC/POS control)**

`src/main/print/tickets.ts`:
```ts
import type { TicketItem } from './router'
export function buildKitchenTicket(o: { token: number; station: string; items: TicketItem[] }): string {
  const lines = [`*** ${o.station} ***`, `TOKEN #${o.token}`, '--------------------------------']
  for (const it of o.items) {
    lines.push(`${it.qty} x ${it.name}`)
    for (const m of it.modifiers ?? []) lines.push(`   - ${m}`)
  }
  lines.push('--------------------------------', new Date().toLocaleTimeString())
  return lines.join('\n')
}
export function buildReceipt(o: {
  token: number; items: { name: string; qty: number; price: number }[]
  subtotal: number; discount: number; tax: number; total: number; tender: number; change: number
}): string {
  const money = (n: number) => `$${n.toFixed(2)}`
  const lines = ['RECEIPT', `TOKEN #${o.token}`, '--------------------------------']
  for (const it of o.items) lines.push(`${it.qty} x ${it.name}  ${money(it.price * it.qty)}`)
  lines.push('--------------------------------',
    `Subtotal ${money(o.subtotal)}`,
    ...(o.discount ? [`Discount -${money(o.discount)}`] : []),
    `Tax ${money(o.tax)}`, `TOTAL ${money(o.total)}`,
    `Cash ${money(o.tender)}`, `Change ${money(o.change)}`,
    '', 'Thank you!')
  return lines.join('\n')
}
```

- [ ] **Step 8: Run — expect PASS.** `npm test -- tickets` → PASS.

- [ ] **Step 9: Implement the print engine (queue + retry + drawer kick)**

`src/main/print/engine.ts`:
```ts
import { ThermalPrinter, PrinterTypes } from 'node-thermal-printer'
import { EventEmitter } from 'node:events'

export interface PrinterCfg { station: string; type: 'epson' | 'star'; address: string } // address: 'tcp://192.168.1.50' or usb path
export const printEvents = new EventEmitter() // emits 'fail' {station,error} and 'ok' {station}

function make(cfg: PrinterCfg) {
  return new ThermalPrinter({
    type: cfg.type === 'star' ? PrinterTypes.STAR : PrinterTypes.EPSON,
    interface: cfg.address,
  })
}

export async function printBody(cfg: PrinterCfg, body: string, opts: { kickDrawer?: boolean } = {}) {
  const p = make(cfg)
  if (!(await p.isPrinterConnected())) throw new Error(`printer ${cfg.station} offline (${cfg.address})`)
  p.alignCenter(); p.println(body); p.cut()
  if (opts.kickDrawer) p.openCashDrawer()
  await p.execute()
}

export async function printWithRetry(cfg: PrinterCfg, body: string, opts: { kickDrawer?: boolean } = {}, tries = 3) {
  let lastErr: unknown
  for (let i = 0; i < tries; i++) {
    try { await printBody(cfg, body, opts); printEvents.emit('ok', { station: cfg.station }); return }
    catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 400 * (i + 1))) }
  }
  printEvents.emit('fail', { station: cfg.station, error: String(lastErr) })
  throw lastErr
}
```

- [ ] **Step 10: Commit**

```bash
git add src/main/print tests/tickets.test.ts tests/router.test.ts
git commit -m "feat: print engine (tickets, station routing, retry, drawer kick)"
```

---

## Task 7: IPC bridge (expose main services to renderer)

**Files:** Create `src/main/ipc/channels.ts`; Modify `src/main/index.ts`, `src/preload/index.ts`.

- [ ] **Step 1: Register IPC handlers**

`src/main/ipc/channels.ts`:
```ts
import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { listMenu } from '../db/repo'
import { login } from '../api/auth'
import { syncCatalog } from '../sync/catalog'
import { priceOrder, type PriceLine, type Discount } from '../order/pricing'
import { routeByStation, type TicketItem } from '../print/router'
import { buildKitchenTicket, buildReceipt } from '../print/tickets'
import { printWithRetry, type PrinterCfg } from '../print/engine'

export function registerIpc(db: Database.Database, env: Record<string, string>) {
  let session: Awaited<ReturnType<typeof login>> | null = null

  ipcMain.handle('auth:login', async () => {
    session = await login(env.VITEPOS_BASE_URL, env.VITEPOS_POS_USER, env.VITEPOS_POS_PASS,
      `${env.VITEPOS_OUTLET}|${env.VITEPOS_COUNTER}`)
    return { ok: true }
  })
  ipcMain.handle('catalog:sync', async () => { if (!session) throw new Error('not logged in'); return syncCatalog(db, session) })
  ipcMain.handle('menu:list', () => listMenu(db))
  ipcMain.handle('printers:list', () => db.prepare('SELECT station,type,address FROM printers').all())
  ipcMain.handle('order:price', (_e, lines: PriceLine[], d: Discount) => priceOrder(lines, d))

  ipcMain.handle('order:commit', (_e, payload: {
    items: (TicketItem & { price: number; product_id: number })[]
    totals: { subtotal: number; discount: number; tax: number; total: number; tender: number; change: number }
    printers: PrinterCfg[]
  }) => {
    const token = (db.prepare(`SELECT COALESCE(MAX(token),0)+1 t FROM orders WHERE date(created_at)=date('now')`).get() as any).t
    const info = db.prepare(`INSERT INTO orders (token,status,subtotal,tax,discount,total,tender,change,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(token, 'completed', payload.totals.subtotal, payload.totals.tax,
      payload.totals.discount, payload.totals.total, payload.totals.tender, payload.totals.change, new Date().toISOString())
    const oid = info.lastInsertRowid as number
    const insItem = db.prepare(`INSERT INTO order_items (order_id,product_id,name,qty,price,station,modifiers) VALUES (?,?,?,?,?,?,?)`)
    for (const it of payload.items) insItem.run(oid, it.product_id, it.name, it.qty, it.price, it.station, JSON.stringify(it.modifiers ?? []))

    const byStation = routeByStation(payload.items)
    const byName = Object.fromEntries(payload.printers.map(p => [p.station, p]))
    if (byName.counter) void printWithRetry(byName.counter, buildReceipt({ token, ...payload.totals, items: payload.items }), { kickDrawer: true })
    for (const [station, items] of Object.entries(byStation)) {
      const cfg = byName[station]; if (!cfg) continue
      void printWithRetry(cfg, buildKitchenTicket({ token, station: station.toUpperCase(), items }))
    }
    return { token, orderId: oid }
  })
}
```

- [ ] **Step 2: Wire main bootstrap**

In `src/main/index.ts`, after the app is ready (before window creation), add and keep the template's existing window code:
```ts
import 'dotenv/config'
import { app } from 'electron'
import { openDb } from './db/connection'
import { migrate } from './db/schema'
import { registerIpc } from './ipc/channels'

const db = openDb(`${app.getPath('userData')}/pos.db`)
migrate(db)
if ((db.prepare('SELECT COUNT(*) c FROM printers').get() as any).c === 0) {
  const ins = db.prepare('INSERT INTO printers (station,type,address) VALUES (?,?,?)')
  ins.run('counter', 'epson', process.env.PRINTER_COUNTER ?? 'tcp://192.168.1.50')
  ins.run('kitchen', 'epson', process.env.PRINTER_KITCHEN ?? 'tcp://192.168.1.51')
  ins.run('bar', 'epson', process.env.PRINTER_BAR ?? 'tcp://192.168.1.52')
}
registerIpc(db, process.env as Record<string, string>)
```

- [ ] **Step 3: Expose preload API**

Replace the exposed API in `src/preload/index.ts`:
```ts
import { contextBridge, ipcRenderer } from 'electron'
const pos = {
  login: () => ipcRenderer.invoke('auth:login'),
  syncCatalog: () => ipcRenderer.invoke('catalog:sync'),
  menu: () => ipcRenderer.invoke('menu:list'),
  printers: () => ipcRenderer.invoke('printers:list'),
  price: (lines: any[], d: any) => ipcRenderer.invoke('order:price', lines, d),
  commit: (payload: any) => ipcRenderer.invoke('order:commit', payload),
}
contextBridge.exposeInMainWorld('pos', pos)
export type PosApi = typeof pos
```

- [ ] **Step 4: Verify it boots + syncs**

Run: `npm run dev`. In the window devtools console:
```js
await window.pos.login(); await window.pos.syncCatalog(); (await window.pos.menu()).length
```
Expected: login `{ok:true}`, sync `{products, categories}`, menu length > 0.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc src/main/index.ts src/preload/index.ts && git commit -m "feat: IPC bridge + main bootstrap (db, printers, services)"
```

---

## Task 8: Renderer — order UI

**Files:** Create `src/renderer/src/types.ts`, `state/cart.ts`, `components/MenuGrid.tsx`, `components/CartPanel.tsx`, `components/PayModal.tsx`, `components/ModifierModal.tsx`; Modify `src/renderer/src/App.tsx`.

- [ ] **Step 1: Shared types**

`src/renderer/src/types.ts`:
```ts
export interface MenuItem { id: number; name: string; price: number; category_id: number | null; station?: string }
export interface CartLine { product_id: number; name: string; price: number; qty: number; station: string; modifiers: string[] }
```

- [ ] **Step 2: Cart store (zustand)**

`src/renderer/src/state/cart.ts`:
```ts
import { create } from 'zustand'
import type { CartLine, MenuItem } from '../types'

interface CartState {
  lines: CartLine[]; held: CartLine[][]
  add: (m: MenuItem, station: string, modifiers?: string[]) => void
  changeQty: (i: number, d: number) => void
  clear: () => void
  hold: () => void
  recall: (i: number) => void
}
export const useCart = create<CartState>((set) => ({
  lines: [], held: [],
  add: (m, station, modifiers = []) => set(s => {
    const key = `${m.id}:${modifiers.join(',')}`
    const idx = s.lines.findIndex(l => `${l.product_id}:${l.modifiers.join(',')}` === key)
    if (idx >= 0) { const lines = [...s.lines]; lines[idx] = { ...lines[idx], qty: lines[idx].qty + 1 }; return { lines } }
    return { lines: [...s.lines, { product_id: m.id, name: m.name, price: m.price, qty: 1, station, modifiers }] }
  }),
  changeQty: (i, d) => set(s => {
    const lines = [...s.lines]; lines[i] = { ...lines[i], qty: Math.max(0, lines[i].qty + d) }
    return { lines: lines.filter(l => l.qty > 0) }
  }),
  clear: () => set({ lines: [] }),
  hold: () => set(s => s.lines.length ? { held: [...s.held, s.lines], lines: [] } : s),
  recall: (i) => set(s => ({ lines: s.held[i], held: s.held.filter((_, j) => j !== i) })),
}))
```

- [ ] **Step 3: MenuGrid**

`src/renderer/src/components/MenuGrid.tsx`:
```tsx
import { useEffect, useState } from 'react'
import type { MenuItem } from '../types'
import { useCart } from '../state/cart'

export function MenuGrid({ stationOf }: { stationOf: (m: MenuItem) => string }) {
  const [items, setItems] = useState<MenuItem[]>([])
  const add = useCart(s => s.add)
  useEffect(() => { (window as any).pos.menu().then(setItems) }, [])
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 8, padding: 8, overflow: 'auto' }}>
      {items.map(m => (
        <button key={m.id} onClick={() => add(m, stationOf(m))}
          style={{ height: 90, borderRadius: 10, border: '1px solid #ddd', fontSize: 14 }}>
          <div>{m.name}</div><div>${m.price.toFixed(2)}</div>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: CartPanel**

`src/renderer/src/components/CartPanel.tsx`:
```tsx
import { useCart } from '../state/cart'
export function CartPanel({ onPay }: { onPay: () => void }) {
  const { lines, changeQty, hold, held, recall, clear } = useCart()
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid #eee' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <span>{l.name}{l.modifiers.length ? ` (${l.modifiers.join(', ')})` : ''}</span>
            <span>
              <button onClick={() => changeQty(i, -1)}>−</button> {l.qty} <button onClick={() => changeQty(i, +1)}>＋</button>
              &nbsp;${(l.price * l.qty).toFixed(2)}
            </span>
          </div>
        ))}
        {held.length > 0 && <div style={{ marginTop: 12, fontSize: 12 }}>Held: {held.map((_, i) => <button key={i} onClick={() => recall(i)}>#{i + 1}</button>)}</div>}
      </div>
      <div style={{ padding: 8, borderTop: '1px solid #eee' }}>
        <div>Subtotal ${subtotal.toFixed(2)}</div>
        <button onClick={hold} disabled={!lines.length}>Hold</button>
        <button onClick={clear} disabled={!lines.length}>Clear</button>
        <button onClick={onPay} disabled={!lines.length} style={{ fontWeight: 700 }}>PAY</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: PayModal (cash → commit → print)**

`src/renderer/src/components/PayModal.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { useCart } from '../state/cart'

export function PayModal({ onClose }: { onClose: () => void }) {
  const { lines, clear } = useCart()
  const [totals, setTotals] = useState<any>(null)
  const [tender, setTender] = useState(0)
  useEffect(() => {
    const pl = lines.map(l => ({ price: l.price, qty: l.qty, taxRate: 0.1 })) // taxRate wired from tax table in Phase 2
    ;(window as any).pos.price(pl, null).then(setTotals)
  }, [lines])
  if (!totals) return null
  const change = Math.max(0, tender - totals.total)
  async function pay() {
    const printers = await (window as any).pos.printers()
    const { token } = await (window as any).pos.commit({
      items: lines.map(l => ({ ...l })),
      totals: { ...totals, tender, change }, printers,
    })
    alert(`Order #${token} sent. Change $${change.toFixed(2)}`)
    clear(); onClose()
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0008', display: 'grid', placeItems: 'center' }}>
      <div style={{ background: '#fff', padding: 20, borderRadius: 12, minWidth: 300 }}>
        <h3>Total ${totals.total.toFixed(2)}</h3>
        <div>Tax ${totals.tax.toFixed(2)}</div>
        <input type="number" placeholder="Cash tendered" value={tender || ''} onChange={e => setTender(+e.target.value)} autoFocus />
        <div>Change ${change.toFixed(2)}</div>
        <button onClick={onClose}>Cancel</button>
        <button disabled={tender < totals.total} onClick={pay} style={{ fontWeight: 700 }}>Complete</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: ModifierModal (minimal free-text note; Phase 2 loads real addons)**

`src/renderer/src/components/ModifierModal.tsx`:
```tsx
import { useState } from 'react'
export function ModifierModal({ onAdd, onClose }: { onAdd: (mods: string[]) => void; onClose: () => void }) {
  const [note, setNote] = useState('')
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0008', display: 'grid', placeItems: 'center' }}>
      <div style={{ background: '#fff', padding: 20, borderRadius: 12 }}>
        <input placeholder="Note (e.g. no onion)" value={note} onChange={e => setNote(e.target.value)} autoFocus />
        <button onClick={onClose}>Cancel</button>
        <button onClick={() => { onAdd(note ? [note] : []); onClose() }}>Add</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: App shell wires it together**

`src/renderer/src/App.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { MenuGrid } from './components/MenuGrid'
import { CartPanel } from './components/CartPanel'
import { PayModal } from './components/PayModal'
import type { MenuItem } from './types'

// Station rule for Phase 1: category-name heuristic; Phase 2 uses categories.station column.
const stationOf = (m: MenuItem) => (/drink|beverage|coffee|tea|juice|soda|bar/i.test(m.name) ? 'bar' : 'kitchen')

export default function App() {
  const [ready, setReady] = useState(false)
  const [paying, setPaying] = useState(false)
  useEffect(() => { (async () => { await (window as any).pos.login(); await (window as any).pos.syncCatalog(); setReady(true) })() }, [])
  if (!ready) return <div style={{ padding: 40 }}>Connecting & syncing menu…</div>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', height: '100vh' }}>
      <MenuGrid stationOf={stationOf} />
      <CartPanel onPay={() => setPaying(true)} />
      {paying && <PayModal onClose={() => setPaying(false)} />}
    </div>
  )
}
```

- [ ] **Step 8: Run the full app**

Run: `npm run dev`
Expected: app logs in, syncs, shows the menu grid; tapping tiles fills the cart; PAY → cash → Complete shows the order token.

- [ ] **Step 9: Commit**

```bash
git add src/renderer && git commit -m "feat: renderer order UI (menu, cart, hold, cash pay)"
```

---

## Task 9: End-to-end smoke test on the live counter

**Files:** none (manual + checklist). Requires at least one real printer reachable at its configured `tcp://IP`.

- [ ] **Step 1: Point printer config at the real device.** Set `PRINTER_COUNTER` (and kitchen/bar if present) in `.env` to the real `tcp://<printer-ip>`; update or delete the seeded `printers` rows once so the new addresses load.

- [ ] **Step 2: Run a real order.** `npm run dev` → add items spanning food + drink → PAY → cash → Complete.

- [ ] **Step 3: Verify (checklist):**
  - Receipt prints at the counter and the cash drawer kicks.
  - Kitchen ticket prints food lines with token, no prices.
  - Bar ticket prints drink lines with token.
  - Order row is saved locally (`orders` table has the new row).
  - Pull the network cable, repeat the order → **still prints** (local-first proof); order saved with `synced=0`.

- [ ] **Step 4: Tag the milestone**

```bash
git commit --allow-empty -m "chore: Phase 1 usable milestone" && git tag phase1-usable
```

---

## Self-Review (completed by author)

- **Spec coverage:** printing counter+kitchen+bar (Tasks 6, 9) ✓; fast local-first (Tasks 2, 4, 8) ✓; offline counter ops (Task 9 pull-cable) ✓; pay-first + token (Task 7 commit) ✓; local pricing tax-after-discount (Task 5) ✓; auth + outlet header (Task 3) ✓; catalog sync (Task 4) ✓; UI ownership (Task 8) ✓. **Deferred to later phases by design:** offline→server push, online-orders-to-kitchen, card terminal, real addon/tax wiring (Phase 2); kiosk + auto-update (Phase 3).
- **Placeholder scan:** none — every step has code or exact commands. `ModifierModal` is intentionally a minimal free-text note, not a stub.
- **Type consistency:** `PrinterCfg`, `TicketItem`, `CartLine`, `PriceLine`, `priceOrder`, and the `order:commit` payload match across Tasks 5–8.
- **Known adjust-on-contact:** exact JSON field names for products/categories/taxes/nonce come from the Task-1 fixtures; `normalizeProduct` and `login` mark where to align them.
