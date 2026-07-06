import { describe, it, expect } from 'vitest'
import { openDb } from '../src/main/db/connection'
import { migrate } from '../src/main/db/schema'

// NOTE: needs the better-sqlite3 native binary. This Mac's toolchain can't compile it
// (see BUILD-NOTES.md); run under Node 20 LTS (prebuilt binary) to execute this file.
describe('schema', () => {
  it('stores and reads a product', () => {
    const db = openDb(':memory:')
    migrate(db)
    db.prepare('INSERT INTO products (id,name,price,category_id) VALUES (?,?,?,?)').run(1, 'Latte', 5.5, 10)
    const row = db.prepare('SELECT name, price FROM products WHERE id=1').get() as any
    expect(row).toEqual({ name: 'Latte', price: 5.5 })
  })
})
