import type { CSSProperties } from 'react'
import { useCart } from '../state/cart'

const qtyBtn: CSSProperties = { width: 28, height: 28, borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }
const secBtn: CSSProperties = { flex: 1, height: 44, borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }

export function CartPanel({ onPay }: { onPay: () => void }) {
  const { lines, changeQty, hold, held, recall, clear } = useCart()
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid #eee', background: '#fafafa' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {lines.length === 0 && <div style={{ color: '#999', marginTop: 20 }}>Tap products to add</div>}
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #eee' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              {l.name}
              <span style={{ display: 'block', fontSize: 11, color: '#999' }}>{l.station}</span>
            </span>
            <button onClick={() => changeQty(i, -1)} style={qtyBtn}>−</button>
            <span style={{ width: 24, textAlign: 'center' }}>{l.qty}</span>
            <button onClick={() => changeQty(i, +1)} style={qtyBtn}>＋</button>
            <span style={{ width: 64, textAlign: 'right' }}>${(l.price * l.qty).toFixed(2)}</span>
          </div>
        ))}
        {held.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12 }}>
            Held tickets:{' '}
            {held.map((_, i) => (
              <button key={i} onClick={() => recall(i)} style={{ marginRight: 6 }}>
                #{i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ padding: 12, borderTop: '1px solid #ddd' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
          <span>Subtotal</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={hold} disabled={!lines.length} style={secBtn}>Hold</button>
          <button onClick={clear} disabled={!lines.length} style={secBtn}>Clear</button>
          <button onClick={onPay} disabled={!lines.length} style={{ ...secBtn, flex: 2, background: '#111', color: '#fff', fontWeight: 700 }}>
            PAY
          </button>
        </div>
      </div>
    </div>
  )
}
