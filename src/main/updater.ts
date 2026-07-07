import updaterPkg from 'electron-updater'

// Silent background auto-update from the configured publish target (electron-builder).
// No-ops gracefully if no update feed is configured (e.g. local builds).
export function initAutoUpdate() {
  try {
    const { autoUpdater } = updaterPkg
    // Download new versions quietly in the background (checksum-verified — a slow
    // connection can't corrupt it).
    autoUpdater.autoDownload = true
    // Apply the update ONLY when the app is closed (end of day), never while it is
    // running — this is what avoids the "cannot be closed" install error and never
    // interrupts a sale.
    autoUpdater.autoInstallOnAppQuit = true
    // Never surface an update problem to the counter: if a check/download fails, it
    // fails silently and the till keeps running on its current version.
    autoUpdater.on('error', () => undefined)
    void autoUpdater.checkForUpdates().catch(() => undefined)
    // Re-check every 6 hours for a long-running terminal.
    setInterval(() => void autoUpdater.checkForUpdates().catch(() => undefined), 6 * 60 * 60 * 1000)
  } catch {
    /* updater unavailable (dev / no feed) — ignore */
  }
}
