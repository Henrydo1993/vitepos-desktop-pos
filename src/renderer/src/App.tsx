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

export default function App() {
  const [paying, setPaying] = useState(false)
  const [view, setView] = useState<View>('pos')
  const [showSettings, setShowSettings] = useState(false)
  const [firstRun, setFirstRun] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
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
    return window.pos.onOnlineOrder((d) => {
      setToast(`New online order #${d.token} → kitchen`)
      setTimeout(() => setToast(null), 6000)
    })
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
      {toast && <div className="toast">{toast}</div>}
      <VirtualKeyboard />
      {locked && <LockScreen onUnlock={() => setLocked(false)} />}
    </div>
  )
}
