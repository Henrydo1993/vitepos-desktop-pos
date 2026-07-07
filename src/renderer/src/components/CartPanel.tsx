import { useEffect, useState } from 'react'
import { useCart, type OrderType } from '../state/cart'
import { DiscountModal } from './DiscountModal'
import { CustomerModal } from './CustomerModal'
import { FeeModal } from './FeeModal'
import { CalculatorModal } from './CalculatorModal'
import { HeldOrdersModal } from './HeldOrdersModal'

const isPhoto = (img: string | null) => !!img && !/placeholder/i.test(img)
const initials = (n: string) =>
  n.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase()
const OTYPES: { k: OrderType; label: string }[] = [
  { k: 'table', label: 'Table' },
  { k: 'walk_in', label: 'Walk-in' },
  { k: 'takeaway', label: 'Takeaway' },
  { k: 'delivery', label: 'Delivery' },
]

export function CartPanel({ onPay }: { onPay: () => void }) {
  const { lines, held, orderType, setOrderType, discount, note, setNote, customer, setCustomer, fee, setQty, changeQty, clear, hold } =
    useCart()
  const [now, setNow] = useState(() => new Date())
  const [showDisc, setShowDisc] = useState(false)
  const [showCust, setShowCust] = useState(false)
  const [showFee, setShowFee] = useState(false)
  const [showCalc, setShowCalc] = useState(false)
  const [showHeld, setShowHeld] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)
  const qtyTotal = lines.reduce((s, l) => s + l.qty, 0)
  const discAmt = discount ? (discount.type === 'flat' ? discount.value : (subtotal * discount.value) / 100) : 0
  const net = Math.max(0, subtotal - discAmt) + fee
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
      <div className="otype-bar">
        {OTYPES.map((o) => (
          <button key={o.k} className={`otype${orderType === o.k ? ' on' : ''}`} onClick={() => setOrderType(o.k)}>
            {o.label}
          </button>
        ))}
      </div>

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
            Total (Items: {lines.length} · Qty: {qtyTotal})
          </span>
          <b>${net.toFixed(2)}</b>
        </div>
        <input
          className="note-input"
          placeholder="Order note (prints to kitchen)…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="foot-actions" style={{ flexWrap: 'wrap', gap: 6 }}>
          <button className="pill" onClick={() => setShowDisc(true)}>
            − Discount{discAmt ? ` ($${discAmt.toFixed(2)})` : ''}
          </button>
          <button className="pill" onClick={() => setShowFee(true)}>
            ＋ Fee{fee ? ` ($${fee.toFixed(2)})` : ''}
          </button>
          <button className="pill" onClick={() => setShowCalc(true)}>
            🧮 Calc
          </button>
          <button className="pill" onClick={() => setShowHeld(true)}>
            ✋ Held{held.length ? ` (${held.length})` : ''}
          </button>
        </div>
        <div className="cust-row">
          <div className="cust" style={{ cursor: 'pointer' }} onClick={() => setShowCust(true)}>
            {customer ? (
              <>
                👤 {customer.name}
                <span
                  style={{ marginLeft: 'auto', cursor: 'pointer', padding: '0 4px' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setCustomer(null)
                  }}
                >
                  ✕
                </span>
              </>
            ) : (
              '＋ Add / Search Customer…'
            )}
          </div>
        </div>
        <div className="hold-pay">
          <button className="hold-btn" onClick={hold} disabled={!lines.length}>
            ✋ Hold
          </button>
          <button className="pay-btn" onClick={onPay} disabled={!lines.length}>
            <span>${net.toFixed(2)}</span>
            <span>Pay Now ▸</span>
          </button>
        </div>
      </div>

      {showDisc && <DiscountModal subtotal={subtotal} onClose={() => setShowDisc(false)} />}
      {showCust && <CustomerModal onClose={() => setShowCust(false)} />}
      {showFee && <FeeModal onClose={() => setShowFee(false)} />}
      {showCalc && <CalculatorModal onClose={() => setShowCalc(false)} />}
      {showHeld && <HeldOrdersModal onClose={() => setShowHeld(false)} />}
    </div>
  )
}
