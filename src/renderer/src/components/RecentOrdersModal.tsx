import { useEffect, useState } from 'react'

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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" style={{ width: 480, maxWidth: '92vw' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Recent orders</h3>
        <div style={{ maxHeight: 420, overflow: 'auto' }}>
          {orders.length === 0 && <div style={{ color: 'var(--vt-text-2)' }}>No orders yet.</div>}
          {orders.map((o) => (
            <div className="cart-line" key={o.id}>
              <span className="info" title={o.sync_error ?? ''}>
                <span className="n">
                  #{o.token} · ${o.total.toFixed(2)} · {o.payment_method}
                  {o.voided ? ' · VOID' : ''}
                </span>
                <span className={o.synced ? 'synced' : 'pending'} style={{ fontSize: 12 }}>
                  {o.synced ? '✓ synced' : '⏳ pending'}
                </span>
              </span>
              <button className="btn btn-sm" onClick={() => reprint(o.id)}>
                Reprint
              </button>
              {!o.voided && (
                <button className="btn btn-sm btn-del" onClick={() => voidOrder(o.id)}>
                  Void
                </button>
              )}
            </div>
          ))}
        </div>
        <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
