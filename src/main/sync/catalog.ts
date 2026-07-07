import type Database from 'better-sqlite3'
import type { Session } from '../api/auth'
import { fetchCategories, fetchProducts, fetchTaxes } from '../api/client'
import { upsertCategory, upsertProduct } from '../db/repo'

// Mapping confirmed against live opaldessert.com.au product/list shape (see fixtures).
const decodeEntities = (s: any) =>
  String(s ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')

export function normalizeProduct(raw: any) {
  return {
    id: Number(raw.id ?? raw.product_id),
    name: decodeEntities(raw.name ?? raw.title),
    sku: raw.sku ? String(raw.sku) : null,
    price: Number(raw.price ?? raw.regular_price ?? 0) || 0,
    category: Array.isArray(raw.categories) && raw.categories.length ? decodeEntities(raw.categories[0]) : null,
    image: raw.image ? String(raw.image) : null,
    taxable: raw.taxable === 'Y' || raw.taxable === true ? 1 : 0,
    tax_rate: Number(raw.tax_rate ?? 0) || 0,
    type: raw.type ?? 'simple',
    hidden: raw.is_hidden === 'Y' || raw.hidden === true ? 1 : 0,
  }
}

// Unwrap the various response envelopes Vitepos uses (bare array, {rowdata}, {data}).
const toArray = (v: any): any[] => (Array.isArray(v) ? v : (v?.rowdata ?? v?.categories ?? v?.data ?? []))

export async function syncCatalog(db: Database.Database, s: Session) {
  // Products are the only required sync; categories + taxes are best-effort.
  let categoryCount = 0
  try {
    const cats = toArray(await fetchCategories(s))
    if (cats.length) {
      const insCats = db.transaction((rows: any[]) =>
        rows.forEach((c) =>
          upsertCategory(db, {
            id: Number(c.id ?? c.term_id),
            name: String(c.name ?? ''),
            parent_id: Number(c.parent_id ?? c.parent ?? 0) || null,
          }),
        ),
      )
      insCats(cats)
      categoryCount = cats.length
    }
  } catch {
    /* categories endpoint optional */
  }

  let page = 1
  let total = 0
  for (;;) {
    const rows = toArray(await fetchProducts(s, page, 100))
    if (!rows.length) break
    const ins = db.transaction((rs: any[]) => rs.forEach((p) => upsertProduct(db, normalizeProduct(p))))
    ins(rows)
    total += rows.length
    if (rows.length < 100) break
    page++
  }

  try {
    const taxes = toArray(await fetchTaxes(s))
    if (taxes.length) {
      const insTax = db.transaction((rows: any[]) =>
        rows.forEach((t: any) =>
          db
            .prepare(`INSERT INTO taxes (tax_class,rate) VALUES (?,?) ON CONFLICT(tax_class) DO UPDATE SET rate=excluded.rate`)
            .run(String(t.tax_class ?? t.slug ?? 'standard'), Number(t.rate ?? 0)),
        ),
      )
      insTax(taxes)
    }
  } catch {
    /* taxes optional */
  }

  db.prepare(`INSERT INTO meta (key,value) VALUES ('last_sync',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(
    new Date().toISOString(),
  )
  return { products: total, categories: categoryCount }
}
