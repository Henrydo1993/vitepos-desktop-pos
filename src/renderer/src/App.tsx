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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', height: '100vh' }}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #eee', fontSize: 13, color: '#555', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Opal Dessert — Front Counter</strong>
          <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span>{status}</span>
            <button onClick={() => setShowOrders(true)}>Orders</button>
          </span>
        </div>
        {ready ? <MenuGrid /> : <div style={{ padding: 24, color: '#777' }}>{status}</div>}
      </div>
      <CartPanel onPay={() => setPaying(true)} />
      {paying && <PayModal onClose={() => setPaying(false)} />}
      {showOrders && <RecentOrdersModal onClose={() => setShowOrders(false)} />}
      {toast && (
        <div style={{ position: 'fixed', bottom: 20, left: 20, background: '#111', color: '#fff', padding: '12px 18px', borderRadius: 10, fontWeight: 600, boxShadow: '0 4px 16px #0003' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
