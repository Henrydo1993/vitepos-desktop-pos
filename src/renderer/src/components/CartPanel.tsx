import { useEffect, useState } from 'react'
import { useCart } from '../state/cart'

const isPhoto = (img: string | null) => !!img && !/placeholder/i.test(img)
const initials = (n: string) =>
  n.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase()

export function CartPanel({ onPay }: { onPay: () => void }) {
  const { lines, setQty, changeQty, clear, hold } = useCart()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)
  const qtyTotal = lines.reduce((s, l) => s + l.qty, 0)
  const when = now.toLocaleString('en-AU', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  return (
    <div className="cart">
      <div className="cart-top">
        <span className="num"># {lines.length ? 1 : 0}</span>
        <button className="icon-btn danger" onClick={clear} title="Clear order" disabled={!lines.length}>
          ✕
        </button>
        <span className="when">
          {when}
          <br />
          Australia/Melbourne
        </span>
      </div>

      <div className="cart-list">
        {lines.length === 0 && <div className="cart-empty">Tap products to add</div>}
        {lines.map((l, i) => (
          <div className="cart-row" key={i}>
            {isPhoto(l.image) ? (
              <div className="thumb" style={{ backgroundImage: `url("${l.image}")` }} />
            ) : (
              <div className="thumb">{initials(l.name)}</div>
            )}
            <div className="cr-mid">
              <div className="cr-name">{l.name}</div>
              <div className="cr-qty">
                <label>Qty</label>
                <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => changeQty(i, -1)}>
                  −
                </button>
                <input
                  className="qtybox"
                  type="number"
                  min={1}
                  value={l.qty}
                  onChange={(e) => setQty(i, Number(e.target.value))}
                />
                <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => changeQty(i, +1)}>
                  ＋
                </button>
              </div>
            </div>
            <div className="cr-amt">${(l.price * l.qty).toFixed(2)}</div>
          </div>
        ))}
      </div>

      <div className="cart-foot">
        <div className="tot">
          <span>
            Total (Items: {lines.length} and quantity: {qtyTotal})
          </span>
          <b>${subtotal.toFixed(2)}</b>
        </div>
        <div className="foot-actions">
          <button className="pill">− Discount</button>
          <button className="pill">＋ Fee</button>
          <button className="pill icon-only" title="Order note">✎</button>
          <button className="pill icon-only" title="Calculator">🧮</button>
        </div>
        <div className="cust-row">
          <div className="cust">＋ Add / Search Customer…</div>
        </div>
        <div className="hold-pay">
          <button className="hold-btn" onClick={hold} disabled={!lines.length}>
            ✋ Hold
          </button>
          <button className="pay-btn" onClick={onPay} disabled={!lines.length}>
            <span>${subtotal.toFixed(2)}</span>
            <span>Pay Now ▸</span>
          </button>
        </div>
      </div>
    </div>
  )
}
