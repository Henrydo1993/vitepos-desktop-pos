import { useEffect, useState } from 'react'
import { Sidebar, type View } from './components/Sidebar'
import { CartPanel } from './components/CartPanel'
import { ProductArea } from './components/ProductArea'
import { Checkout } from './components/Checkout'
import { LockScreen } from './components/LockScreen'
import { DashboardView } from './components/DashboardView'
import { OrdersView } from './components/OrdersView'
import { TablesView, type TableRow } from './components/TablesView'
import { SettingsModal } from './components/SettingsModal'
import { VirtualKeyboard } from './components/VirtualKeyboard'
import { useAuth } from './state/auth'
import { useCart } from './state/cart'
import { playChime, primeChime } from './chime'

export default function App() {
  const [paying, setPaying] = useState(false)
  const [view, setView] = useState<View>('pos')
  const [showSettings, setShowSettings] = useState(false)
  const [firstRun, setFirstRun] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [opalAlert, setOpalAlert] = useState<string | null>(null)
  const [version, setVersion] = useState('')
  const [locked, setLocked] = useState(true)
  const { staff, setStaff } = useAuth()
  const { setTable, loadOpen, clear } = useCart()

  const openTable = async (t: TableRow) => {
    if (t.open) {
      const o = await window.pos.openOrderGet(t.open.id)
      if (o) loadOpen(o)
    } else {
      clear()
      setTable(t.label, null)
    }
    setView('pos')
  }

  useEffect(() => {
    window.pos.getSettings().then((s) => {
      if (!s.app_password?.trim()) {
        setFirstRun(true)
        setShowSettings(true)
        setLocked(false) // let a brand-new till finish setup before it locks
      }
    })
  }, [])

  // Tell the main process who's signed in so it can enforce role permissions server-side.
  // Cleared while locked, so a locked till has no privileged identity.
  useEffect(() => {
    void window.pos.setStaff(locked ? null : staff)
  }, [locked, staff])

  useEffect(() => {
    // Show the running version, and if it changed since last launch, prove the
    // update installed itself.
    window.pos.appInfo().then(({ version, lastSeen }) => {
      setVersion(version)
      if (lastSeen && lastSeen !== version) {
        setToast(`Updated to v${version} automatically ✓`)
        setTimeout(() => setToast(null), 8000)
      }
      void window.pos.markSeen()
    })
  }, [])

  // Auto-lock the till after 3 minutes of no touch/mouse/key activity.
  useEffect(() => {
    if (locked) return
    let t: ReturnType<typeof setTimeout>
    const reset = () => {
      clearTimeout(t)
      t = setTimeout(() => setLocked(true), 3 * 60 * 1000)
    }
    const evs = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'] as const
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => {
      clearTimeout(t)
      evs.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [locked])

  useEffect(() => {
    primeChime() // let the very first order play sound, even before anyone taps in the app
    const offNew = window.pos.onOnlineOrder((d) => {
      playChime()
      setToast(`New online order #${d.token} → kitchen`)
      setTimeout(() => setToast(null), 6000)
    })
    // A QR/waiter order that failed to reach the kitchen must be LOUD and STAY on screen — this is
    // the exact failure that used to be invisible. Chime + a red banner that holds until dismissed.
    const offTrouble = window.pos.onOpalTrouble((t) => {
      playChime()
      const where = t.table ? ` (${t.table})` : ''
      if (t.kind === 'printfail')
        setOpalAlert(`Order #${t.id}${where} is on its table but the KITCHEN TICKET DID NOT PRINT — reprint it from Orders. [${t.error}]`)
      else if (t.kind === 'pollfail')
        setOpalAlert(`Can't reach online orders right now — QR/waiter orders may not be coming through. Check the internet. [${t.error}]`)
      else setOpalAlert(`A QR/waiter order${where} couldn't be loaded — it will retry automatically. If it keeps failing, call support. [${t.error}]`)
    })
    return () => {
      offNew()
      offTrouble()
    }
  }, [])

  return (
    <div className="pos-shell">
      <Sidebar
        view={view}
        onNav={setView}
        onSettings={() => setShowSettings(true)}
        onLogout={() => {
          setStaff(null)
          setView('pos')
          setLocked(true)
        }}
        staff={staff}
        version={version}
      />
      {view === 'pos' ? (
        <>
          <CartPanel onPay={() => setPaying(true)} onTables={() => setView('tables')} />
          {paying ? <Checkout onClose={() => setPaying(false)} /> : <ProductArea />}
        </>
      ) : (
        <div style={{ gridColumn: '2 / -1', minHeight: 0, overflow: 'hidden' }}>
          {view === 'dashboard' ? <DashboardView /> : view === 'orders' ? <OrdersView /> : <TablesView onOpen={openTable} />}
        </div>
      )}
      {showSettings && (
        <SettingsModal
          firstRun={firstRun}
          onClose={() => {
            setShowSettings(false)
            setFirstRun(false)
          }}
        />
      )}
      {opalAlert && (
        <div className="alert-banner" role="alert" onClick={() => setOpalAlert(null)}>
          <span className="alert-msg">⚠ {opalAlert}</span>
          <span className="alert-x">Tap to dismiss</span>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
      <VirtualKeyboard />
      {locked && <LockScreen onUnlock={() => setLocked(false)} />}
    </div>
  )
}
