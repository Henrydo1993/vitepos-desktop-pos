import { useEffect, useState } from 'react'
import { MenuGrid } from './components/MenuGrid'
import { CartPanel } from './components/CartPanel'
import { PayModal } from './components/PayModal'
import { RecentOrdersModal } from './components/RecentOrdersModal'

export default function App() {
  const [status, setStatus] = useState('Syncing menu…')
  const [ready, setReady] = useState(false)
  const [paying, setPaying] = useState(false)
  const [showOrders, setShowOrders] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    window.pos
      .syncCatalog()
      .then((r) => {
        setStatus(`${r.products} products`)
        setReady(true)
      })
      .catch((e) => setStatus(`Sync failed: ${(e as Error)?.message ?? e}`))
  }, [])

  useEffect(() => {
    return window.pos.onOnlineOrder((d) => {
      setToast(`New online order #${d.token} → kitchen`)
      setTimeout(() => setToast(null), 6000)
    })
  }, [])

  return (
    <div className="pos-app">
      <div className="pos-main">
        <div className="pos-topbar">
          <span className="brand">Opal Dessert · Front Counter</span>
          <span className="meta">
            <span>{status}</span>
            <button className="btn btn-sm" onClick={() => setShowOrders(true)}>
              Orders
            </button>
          </span>
        </div>
        {ready ? <MenuGrid /> : <div style={{ padding: 24, color: 'var(--vt-text-2)' }}>{status}</div>}
      </div>
      <CartPanel onPay={() => setPaying(true)} />
      {paying && <PayModal onClose={() => setPaying(false)} />}
      {showOrders && <RecentOrdersModal onClose={() => setShowOrders(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
