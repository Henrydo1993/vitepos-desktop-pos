import 'dotenv/config'
import { app, BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type BetterSqlite3 from 'better-sqlite3'
import { openDb } from './db/connection'
import { migrate } from './db/schema'
import { makeSession } from './api/auth'
import { registerIpc, startSync } from './ipc/channels'
import { initAutoUpdate } from './updater'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDev = !!process.env.ELECTRON_RENDERER_URL
const KIOSK = process.env.POS_KIOSK === '1' && !isDev

function seedPrinters(db: BetterSqlite3.Database) {
  const count = (db.prepare('SELECT COUNT(*) c FROM printers').get() as { c: number }).c
  if (count > 0) return
  const ins = db.prepare('INSERT INTO printers (station,type,address) VALUES (?,?,?)')
  const val = (v?: string) => (v && v !== 'tcp://' ? v : '')
  if (val(process.env.PRINTER_COUNTER)) ins.run('counter', 'epson', process.env.PRINTER_COUNTER)
  if (val(process.env.PRINTER_KITCHEN)) ins.run('kitchen', 'epson', process.env.PRINTER_KITCHEN)
  if (val(process.env.PRINTER_BAR)) ins.run('bar', 'epson', process.env.PRINTER_BAR)
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    kiosk: KIOSK,
    fullscreen: KIOSK,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      devTools: isDev,
    },
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.whenReady().then(() => {
    const env = process.env as Record<string, string>
    const db = openDb(join(app.getPath('userData'), 'pos.db'))
    migrate(db)
    seedPrinters(db)
    const session = makeSession(
      env.VITEPOS_BASE_URL,
      env.VITEPOS_POS_USER,
      env.VITEPOS_APP_PASSWORD,
      `${env.VITEPOS_OUTLET}|${env.VITEPOS_COUNTER}`,
    )
    registerIpc(db, session, env)
    const win = createWindow()
    startSync(db, session, env, (ch, data) => {
      if (!win.isDestroyed()) win.webContents.send(ch, data)
    })
    if (!isDev) initAutoUpdate()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
