import 'dotenv/config'
import { app, BrowserWindow, shell, session } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type BetterSqlite3 from 'better-sqlite3'
import type { Session } from './api/auth'
import { openDb } from './db/connection'
import { migrate } from './db/schema'
import { makeSession } from './api/auth'
import { getSettings, sessionArgs, seedPrintersFromSettings, migrateSecrets } from './config'
import { registerIpc, startSync } from './ipc/channels'
import { initAutoUpdate } from './updater'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDev = !!process.env.ELECTRON_RENDERER_URL
const KIOSK = process.env.POS_KIOSK === '1' && !isDev

function newSession(db: BetterSqlite3.Database): Session {
  const a = sessionArgs(getSettings(db))
  return makeSession(a.baseURL, a.user, a.appPassword, a.outlet)
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
      // Hardened: the preload is contextBridge-only, so the OS sandbox is safe to enable.
      // contextIsolation + nodeIntegration keep their secure defaults (on / off).
      sandbox: true,
      webSecurity: true,
      devTools: isDev,
    },
  })
  // Lock the shell down: the renderer must never navigate away or spawn windows. Any external
  // link opens in the user's real browser instead of hijacking the till UI.
  win.webContents.on('will-navigate', (e, url) => {
    const current = process.env.ELECTRON_RENDERER_URL ?? ''
    if (url !== current && !url.startsWith('file://')) e.preventDefault()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.whenReady().then(() => {
    // Content-Security-Policy (production only — dev keeps HMR). script-src 'self' blocks any
    // injected script; images allow http(s) for WooCommerce product photos; the renderer makes
    // no direct network calls (everything goes through IPC), so connect-src is 'self'.
    if (!isDev) {
      const csp =
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https: http:; font-src 'self' data:; connect-src 'self'; " +
        "object-src 'none'; base-uri 'self'; form-action 'none'"
      session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
        cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } })
      })
    }
    const db = openDb(join(app.getPath('userData'), 'pos.db'))
    migrate(db)
    migrateSecrets(db) // encrypt any plaintext App Password left by an older build (keychain now available)
    // Seed printers from settings only on a brand-new DB (empty printers table).
    if ((db.prepare('SELECT COUNT(*) c FROM printers').get() as { c: number }).c === 0) {
      seedPrintersFromSettings(db, getSettings(db))
    }
    const sessionRef = { current: newSession(db) }
    registerIpc(db, sessionRef, () => {
      sessionRef.current = newSession(db)
    })
    const win = createWindow()
    startSync(db, sessionRef, (ch, data) => {
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
