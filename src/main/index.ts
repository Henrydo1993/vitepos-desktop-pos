import 'dotenv/config'
import { app, BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type BetterSqlite3 from 'better-sqlite3'
import { openDb } from './db/connection'
import { migrate } from './db/schema'
import { registerIpc } from './ipc/channels'

const __dirname = dirname(fileURLToPath(import.meta.url))

function seedPrinters(db: BetterSqlite3.Database) {
  const count = (db.prepare('SELECT COUNT(*) c FROM printers').get() as { c: number }).c
  if (count > 0) return
  const ins = db.prepare('INSERT INTO printers (station,type,address) VALUES (?,?,?)')
  const val = (v?: string) => (v && v !== 'tcp://' ? v : '')
  if (val(process.env.PRINTER_COUNTER)) ins.run('counter', 'epson', process.env.PRINTER_COUNTER)
  if (val(process.env.PRINTER_KITCHEN)) ins.run('kitchen', 'epson', process.env.PRINTER_KITCHEN)
  if (val(process.env.PRINTER_BAR)) ins.run('bar', 'epson', process.env.PRINTER_BAR)
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  const db = openDb(join(app.getPath('userData'), 'pos.db'))
  migrate(db)
  seedPrinters(db)
  registerIpc(db, process.env as Record<string, string>)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
