import type Database from 'better-sqlite3'

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, parent_id INTEGER, station TEXT )`,
  `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, sku TEXT, price REAL NOT NULL,
      category TEXT, taxable INTEGER DEFAULT 0, tax_rate REAL DEFAULT 0,
      type TEXT DEFAULT 'simple', hidden INTEGER DEFAULT 0 )`,
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
  const run = db.transaction(() => {
    for (const sql of STATEMENTS) db.prepare(sql).run()
  })
  run()
}
