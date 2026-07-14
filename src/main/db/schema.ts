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
  // Ordering-app (opal-pos-connect) orders already printed, so they print once.
  `CREATE TABLE IF NOT EXISTS seen_opal (remote_id INTEGER PRIMARY KEY, seen_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, pin_hash TEXT NOT NULL,
      role TEXT DEFAULT 'staff', active INTEGER DEFAULT 1, created_at TEXT )`,
  // Restaurant mode: unpaid open tabs held against a table (survive restarts).
  `CREATE TABLE IF NOT EXISTS open_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, table_label TEXT, order_type TEXT DEFAULT 'table',
      note TEXT, customer_id INTEGER, customer_name TEXT, staff_name TEXT,
      lines TEXT, created_at TEXT, updated_at TEXT )`,
  // Day/shift session: opening cash float + end-of-day close.
  `CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, opened_at TEXT, opened_by TEXT, opening_float REAL DEFAULT 0,
      closed_at TEXT, closed_by TEXT, counted_cash REAL, status TEXT DEFAULT 'open' )`,
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
  'ALTER TABLE orders ADD COLUMN push_tries INTEGER DEFAULT 0',
  // QR/waiter table settle (#1): tie a paid tab back to its origin WooCommerce order(s)
  // instead of creating a duplicate.
  'ALTER TABLE open_orders ADD COLUMN remote_ids TEXT',
  'ALTER TABLE orders ADD COLUMN opal_remote_ids TEXT',
  'ALTER TABLE orders ADD COLUMN opal_settled INTEGER DEFAULT 0',
  // Shift attribution (#5): NULL = pre-migration (attributed by time window), 0 = rung with
  // no shift open, >0 = the shift it belongs to.
  'ALTER TABLE orders ADD COLUMN shift_id INTEGER',
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
