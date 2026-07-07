import type BetterSqlite3 from 'better-sqlite3'

// Settings live in the `meta` table (cfg_* keys) so a packaged app needs no .env.
// Resolution order per key: saved value -> dev env var -> baked default.
// Non-secret connection defaults are baked so the owner's setup screen is pre-filled;
// the Application Password is entered once on first run (kept out of the binary/repo).
const DEFAULTS: Record<string, string> = {
  base_url: 'https://opaldessert.com.au',
  pos_user: 'henrydo',
  app_password: '',
  outlet: '1',
  counter: '1',
  printer_counter: '',
  printer_kitchen: '',
  printer_bar: '',
}

const ENV: Record<string, string> = {
  base_url: 'VITEPOS_BASE_URL',
  pos_user: 'VITEPOS_POS_USER',
  app_password: 'VITEPOS_APP_PASSWORD',
  outlet: 'VITEPOS_OUTLET',
  counter: 'VITEPOS_COUNTER',
  printer_counter: 'PRINTER_COUNTER',
  printer_kitchen: 'PRINTER_KITCHEN',
  printer_bar: 'PRINTER_BAR',
}

export const SETTING_KEYS = Object.keys(DEFAULTS)
export type Settings = Record<string, string>

export function getSettings(db: BetterSqlite3.Database): Settings {
  const stmt = db.prepare('SELECT value FROM meta WHERE key=?')
  const out: Settings = {}
  for (const k of SETTING_KEYS) {
    const row = stmt.get(`cfg_${k}`) as { value: string } | undefined
    out[k] = (row?.value ?? process.env[ENV[k]] ?? DEFAULTS[k] ?? '').trim()
  }
  return out
}

export function saveSettings(db: BetterSqlite3.Database, patch: Settings) {
  const up = db.prepare('INSERT INTO meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
  const tx = db.transaction((p: Settings) => {
    for (const [k, v] of Object.entries(p)) if (SETTING_KEYS.includes(k)) up.run(`cfg_${k}`, String(v ?? '').trim())
  })
  tx(patch)
}

// True once the owner has entered the credential the app needs to connect.
export function isConfigured(s: Settings): boolean {
  return !!s.base_url && !!s.app_password
}

export function sessionArgs(s: Settings) {
  return {
    baseURL: s.base_url,
    user: s.pos_user,
    appPassword: s.app_password,
    outlet: `${s.outlet}|${s.counter}`,
  }
}

export function seedPrintersFromSettings(db: BetterSqlite3.Database, s: Settings) {
  db.prepare('DELETE FROM printers').run()
  const ins = db.prepare('INSERT INTO printers (station,type,address) VALUES (?,?,?)')
  const ok = (v?: string) => !!v && v !== 'tcp://'
  if (ok(s.printer_counter)) ins.run('counter', 'epson', s.printer_counter)
  if (ok(s.printer_kitchen)) ins.run('kitchen', 'epson', s.printer_kitchen)
  if (ok(s.printer_bar)) ins.run('bar', 'epson', s.printer_bar)
}
