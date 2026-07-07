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

export interface ProductRow {
  id: number
  name: string
  sku?: string | null
  price: number
  category?: string | null
  image?: string | null
  variations?: string | null
  taxable?: number
  tax_rate?: number
  type?: string
  hidden?: number
}

export const upsertProduct = (db: Database.Database, p: ProductRow) =>
  db
    .prepare(
      `INSERT INTO products (id,name,sku,price,category,image,variations,taxable,tax_rate,type,hidden)
       VALUES (@id,@name,@sku,@price,@category,@image,@variations,@taxable,@tax_rate,@type,@hidden)
       ON CONFLICT(id) DO UPDATE SET name=@name, sku=@sku, price=@price, category=@category,
         image=@image, variations=@variations, taxable=@taxable, tax_rate=@tax_rate, type=@type, hidden=@hidden`,
    )
    .run({ sku: null, category: null, image: null, variations: null, taxable: 0, tax_rate: 0, type: 'simple', hidden: 0, ...p })

export const listMenu = (db: Database.Database) =>
  db.prepare(`SELECT * FROM products WHERE hidden=0 ORDER BY name`).all()
