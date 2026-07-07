import { useCart } from '../state/cart'

export function CartPanel({ onPay }: { onPay: () => void }) {
  const { lines, changeQty, hold, held, recall, clear } = useCart()
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)
  return (
    <div className="cart-panel">
      <div className="cart-header">Current order</div>
      <div className="cart-items">
        {lines.length === 0 && <div style={{ color: 'var(--vt-text-2)', marginTop: 16 }}>Tap products to add</div>}
        {lines.map((l, i) => (
          <div className="cart-line" key={i}>
            <span className="info">
              <span className="n">{l.name}</span>
              <span className="s">
                {l.station}
                {l.modifiers.length ? ` · ${l.modifiers.join(', ')}` : ''}
              </span>
            </span>
            <button className="qty-btn" onClick={() => changeQty(i, -1)}>
              −
            </button>
            <span className="qty">{l.qty}</span>
            <button className="qty-btn" onClick={() => changeQty(i, +1)}>
              ＋
            </button>
            <span className="amt">${(l.price * l.qty).toFixed(2)}</span>
          </div>
        ))}
        {held.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--vt-text-2)' }}>
            Held:{' '}
            {held.map((_, i) => (
              <button key={i} className="btn btn-sm" style={{ marginRight: 6 }} onClick={() => recall(i)}>
                #{i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="cart-footer">
        <div className="cart-total">
          <span>Subtotal</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={hold} disabled={!lines.length}>
            Hold
          </button>
          <button className="btn btn-del" onClick={clear} disabled={!lines.length}>
            Clear
          </button>
          <button className="btn btn-pay" style={{ flex: 2 }} onClick={onPay} disabled={!lines.length}>
            PAY
          </button>
        </div>
      </div>
    </div>
  )
}
