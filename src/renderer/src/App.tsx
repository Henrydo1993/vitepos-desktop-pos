import { useEffect, useState } from 'react'
import { MenuGrid } from './components/MenuGrid'
import { CartPanel } from './components/CartPanel'
import { PayModal } from './components/PayModal'

export default function App() {
  const [status, setStatus] = useState('Syncing menu…')
  const [ready, setReady] = useState(false)
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    window.pos
      .syncCatalog()
      .then((r) => {
        setStatus(`${r.products} products`)
        setReady(true)
      })
      .catch((e) => setStatus(`Sync failed: ${(e as Error)?.message ?? e}`))
  }, [])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', height: '100vh' }}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #eee', fontSize: 13, color: '#555', display: 'flex', justifyContent: 'space-between' }}>
          <strong>Opal Dessert — Front Counter</strong>
          <span>{status}</span>
        </div>
        {ready ? <MenuGrid /> : <div style={{ padding: 24, color: '#777' }}>{status}</div>}
      </div>
      <CartPanel onPay={() => setPaying(true)} />
      {paying && <PayModal onClose={() => setPaying(false)} />}
    </div>
  )
}
