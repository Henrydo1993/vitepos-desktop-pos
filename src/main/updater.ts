import updaterPkg from 'electron-updater'

// Silent background auto-update from the configured publish target (electron-builder).
// No-ops gracefully if no update feed is configured (e.g. local builds).
export function initAutoUpdate() {
  try {
    const { autoUpdater } = updaterPkg
    autoUpdater.autoDownload = true
    autoUpdater.on('update-downloaded', () => autoUpdater.quitAndInstall(true, true))
    void autoUpdater.checkForUpdatesAndNotify()
    // Re-check every 6 hours for a long-running kiosk terminal.
    setInterval(() => void autoUpdater.checkForUpdates().catch(() => undefined), 6 * 60 * 60 * 1000)
  } catch {
    /* updater unavailable (dev / no feed) — ignore */
  }
}
