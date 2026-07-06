import type Database from 'better-sqlite3'
import type { Session } from '../api/auth'
import { fetchCategories, fetchProducts, fetchTaxes } from '../api/client'
import { upsertCategory, upsertProduct } from '../db/repo'

// Field mapping is defensive: adjust to fixtures/products.json (plan Task 1) if the live shape differs.
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
  const insCats = db.transaction((rows: any[]) =>
    rows.forEach((c) =>
      upsertCategory(db, { id: Number(c.id), name: String(c.name), parent_id: Number(c.parent ?? 0) || null }),
    ),
  )
  insCats(cats)

  let page = 1
  let total = 0
  for (;;) {
    const res = await fetchProducts(s, page, 100)
    const rows: any[] = res?.rowdata ?? res ?? []
    if (!rows.length) break
    const ins = db.transaction((rs: any[]) => rs.forEach((p) => upsertProduct(db, normalizeProduct(p))))
    ins(rows)
    total += rows.length
    if (rows.length < 100) break
    page++
  }

  const taxes = (await fetchTaxes(s)) ?? []
  const insTax = db.transaction((rows: any[]) =>
    rows.forEach((t: any) =>
      db
        .prepare(`INSERT INTO taxes (tax_class,rate) VALUES (?,?) ON CONFLICT(tax_class) DO UPDATE SET rate=excluded.rate`)
        .run(String(t.tax_class ?? t.slug ?? 'standard'), Number(t.rate ?? 0)),
    ),
  )
  insTax(taxes)

  db.prepare(`INSERT INTO meta (key,value) VALUES ('last_sync',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(
    new Date().toISOString(),
  )
  return { products: total, categories: cats.length }
}
