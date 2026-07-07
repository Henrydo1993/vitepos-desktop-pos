import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { CartPanel } from './components/CartPanel'
import { ProductArea } from './components/ProductArea'
import { PayModal } from './components/PayModal'
import { RecentOrdersModal } from './components/RecentOrdersModal'
import { SettingsModal } from './components/SettingsModal'
import { VirtualKeyboard } from './components/VirtualKeyboard'

export default function App() {
  const [paying, setPaying] = useState(false)
  const [showOrders, setShowOrders] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [firstRun, setFirstRun] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.pos.getSettings().then((s) => {
      if (!s.app_password?.trim()) {
        setFirstRun(true)
        setShowSettings(true)
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

  useEffect(() => {
    return window.pos.onOnlineOrder((d) => {
      setToast(`New online order #${d.token} → kitchen`)
      setTimeout(() => setToast(null), 6000)
    })
  }, [])

  return (
    <div className="pos-shell">
      <Sidebar version={version} onOrders={() => setShowOrders(true)} onSettings={() => setShowSettings(true)} />
      <CartPanel onPay={() => setPaying(true)} />
      <ProductArea />
      {paying && <PayModal onClose={() => setPaying(false)} />}
      {showOrders && <RecentOrdersModal onClose={() => setShowOrders(false)} />}
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
    </div>
  )
}
