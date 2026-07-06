import type Database from 'better-sqlite3'

export const upsertCategory = (
  db: Database.Database,
  c: { id: number; name: string; parent_id?: number | null; station?: string | null },
) =>
  db
    .prepare(
      `INSERT INTO categories (id,name,parent_id,station) VALUES (@id,@name,@parent_id,@station)
       ON CONFLICT(id) DO UPDATE SET name=@name, parent_id=@parent_id, station=@station`,
    )
    .run({ parent_id: null, station: null, ...c })

export const upsertProduct = (
  db: Database.Database,
  p: {
    id: number
    name: string
    sku?: string | null
    price: number
    category_id?: number | null
    tax_class?: string | null
    hidden?: number
  },
) =>
  db
    .prepare(
      `INSERT INTO products (id,name,sku,price,category_id,tax_class,hidden)
       VALUES (@id,@name,@sku,@price,@category_id,@tax_class,@hidden)
       ON CONFLICT(id) DO UPDATE SET name=@name, sku=@sku, price=@price,
         category_id=@category_id, tax_class=@tax_class, hidden=@hidden`,
    )
    .run({ sku: null, category_id: null, tax_class: null, hidden: 0, ...p })

export const listMenu = (db: Database.Database) =>
  db.prepare(`SELECT * FROM products WHERE hidden=0 ORDER BY name`).all()
