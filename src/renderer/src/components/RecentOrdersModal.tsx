import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

const overlay: CSSProperties = { position: 'fixed', inset: 0, background: '#0007', display: 'grid', placeItems: 'center' }
const sheet: CSSProperties = { background: '#fff', padding: 20, borderRadius: 14, width: 480, maxWidth: '92vw' }
const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 14 }

interface Order {
  id: number
  token: number
  total: number
  payment_method: string
  voided: number
  synced: number
  sync_error: string | null
  created_at: string
}

export function RecentOrdersModal({ onClose }: { onClose: () => void }) {
  const [orders, setOrders] = useState<Order[]>([])
  const load = () => window.pos.recentOrders().then(setOrders)

  useEffect(() => {
    load()
  }, [])

  const reprint = (id: number) => window.pos.reprint(id)
  const voidOrder = async (id: number) => {
    const reason = prompt('Void reason?')
    if (reason == null) return
    await window.pos.voidOrder(id, reason)
    load()
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Recent orders</h3>
        <div style={{ maxHeight: 420, overflow: 'auto' }}>
          {orders.length === 0 && <div style={{ color: '#888' }}>No orders yet.</div>}
          {orders.map((o) => (
            <div key={o.id} style={row}>
              <span title={o.sync_error ?? ''}>
                #{o.token} · ${o.total.toFixed(2)} · {o.payment_method}
                {o.voided ? ' · VOID' : ''} {o.synced ? '✓ synced' : '⏳ pending'}
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => reprint(o.id)}>Reprint</button>
                {!o.voided && <button onClick={() => voidOrder(o.id)}>Void</button>}
              </span>
            </div>
          ))}
        </div>
        <button onClick={onClose} style={{ marginTop: 12, height: 40, width: '100%', borderRadius: 8, border: '1px solid #ccc', background: '#fff' }}>
          Close
        </button>
      </div>
    </div>
  )
}
