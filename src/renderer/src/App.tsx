import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { CartPanel } from './components/CartPanel'
import { ProductArea } from './components/ProductArea'
import { PayModal } from './components/PayModal'
import { RecentOrdersModal } from './components/RecentOrdersModal'
import { SettingsModal } from './components/SettingsModal'

export default function App() {
  const [paying, setPaying] = useState(false)
  const [showOrders, setShowOrders] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [firstRun, setFirstRun] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    window.pos.getSettings().then((s) => {
      if (!s.app_password?.trim()) {
        setFirstRun(true)
        setShowSettings(true)
      }
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
      <Sidebar onOrders={() => setShowOrders(true)} onSettings={() => setShowSettings(true)} />
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
    </div>
  )
}
