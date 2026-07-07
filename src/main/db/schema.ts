import type Database from 'better-sqlite3'

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, parent_id INTEGER, station TEXT )`,
  `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, sku TEXT, price REAL NOT NULL,
      category TEXT, image TEXT, variations TEXT, taxable INTEGER DEFAULT 0, tax_rate REAL DEFAULT 0,
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
      payment_method TEXT DEFAULT 'cash', voided INTEGER DEFAULT 0, void_reason TEXT,
      created_at TEXT NOT NULL, synced INTEGER DEFAULT 0, remote_id INTEGER, sync_error TEXT )`,
  `CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL,
      product_id INTEGER, name TEXT, qty INTEGER, price REAL, station TEXT,
      modifiers TEXT, FOREIGN KEY(order_id) REFERENCES orders(id) )`,
  `CREATE TABLE IF NOT EXISTS seen_online (remote_id INTEGER PRIMARY KEY, seen_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, pin_hash TEXT NOT NULL,
      role TEXT DEFAULT 'staff', active INTEGER DEFAULT 1, created_at TEXT )`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`,
]

// Additive migrations for existing DBs (CREATE IF NOT EXISTS won't add new columns).
const ALTERS: string[] = [
  'ALTER TABLE products ADD COLUMN image TEXT',
  'ALTER TABLE products ADD COLUMN variations TEXT',
  'ALTER TABLE orders ADD COLUMN order_type TEXT',
  'ALTER TABLE orders ADD COLUMN note TEXT',
  'ALTER TABLE orders ADD COLUMN customer_id INTEGER',
  'ALTER TABLE orders ADD COLUMN customer_name TEXT',
  'ALTER TABLE orders ADD COLUMN staff_name TEXT',
]

export function migrate(db: Database.Database) {
  const run = db.transaction(() => {
    for (const sql of STATEMENTS) db.prepare(sql).run()
  })
  run()
  for (const sql of ALTERS) {
    try {
      db.prepare(sql).run()
    } catch {
      /* column already exists */
    }
  }
}
