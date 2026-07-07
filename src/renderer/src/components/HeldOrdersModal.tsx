import { useCart } from '../state/cart'

export function HeldOrdersModal({ onClose }: { onClose: () => void }) {
  const { held, recall, discardHeld, lines } = useCart()
  const resume = (i: number) => {
    recall(i)
    onClose()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <h3 className="modal-title">Held orders</h3>
        {held.length === 0 && (
          <div style={{ color: 'var(--vt-text-2)', padding: '6px 0 16px' }}>No held orders. Tap ✋ Hold in the cart to park one.</div>
        )}
        <div style={{ maxHeight: 360, overflow: 'auto' }}>
          {held.map((h, i) => {
            const items = h.reduce((s, l) => s + l.qty, 0)
            const total = h.reduce((s, l) => s + l.price * l.qty, 0)
            return (
              <div
                key={i}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--vt-border)' }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>Held #{i + 1}</div>
                  <div style={{ fontSize: 13, color: 'var(--vt-text-2)' }}>
                    {h.length} lines · {items} items · ${total.toFixed(2)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-del" onClick={() => discardHeld(i)}>
                    Discard
                  </button>
                  <button className="btn btn-theme" onClick={() => resume(i)} disabled={lines.length > 0} title={lines.length > 0 ? 'Clear or hold the current order first' : ''}>
                    Resume
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        {lines.length > 0 && held.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--vt-text-2)', marginTop: 10 }}>Finish or hold the current order before resuming a held one.</div>
        )}
        <div className="btn-row" style={{ marginTop: 14 }}>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
