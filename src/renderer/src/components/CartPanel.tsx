import { useEffect, useState } from 'react'
import { useCart, feeAmount, type OrderType } from '../state/cart'
import { useAuth } from '../state/auth'
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

export function CartPanel({ onPay, onTables }: { onPay: () => void; onTables: () => void }) {
  const { lines, held, orderType, setOrderType, discount, note, setNote, customer, setCustomer, fee, tableLabel, openOrderId, setTable, setQty, changeQty, removeLine, clear, hold } =
    useCart()
  const staff = useAuth((s) => s.staff)
  const [now, setNow] = useState(() => new Date())

  const sendKitchen = async () => {
    if (!lines.length) return
    await window.pos.openOrderSend({ id: openOrderId ?? undefined, tableLabel: tableLabel ?? undefined, note, staffName: staff?.name, lines })
    clear()
    onTables()
  }
  // Re-print the kitchen prepare list for a tab already fired to the kitchen — for when the
  // original ticket was lost or jammed. Reprints what's SAVED on the tab (via its id), not any
  // unsaved edits in the cart, so the kitchen gets exactly what it's already making.
  const reprintPrepare = async () => {
    if (!openOrderId || reprinting) return
    setReprinting(true)
    try {
      await window.pos.openOrderReprintPrepare(openOrderId)
    } catch (e) {
      alert((e as Error)?.message ?? 'Could not re-print the prepare list.')
    } finally {
      setReprinting(false)
    }
  }
  // Persist edits (remove / qty change) to a saved table tab so they stick. If the last
  // item is gone the tab is empty — delete it and free the table, instead of leaving an
  // empty tab that still shows the table occupied (green) on the floor.
  const syncTab = (next: typeof lines) => {
    if (!openOrderId) return
    if (next.length === 0) {
      void window.pos.openOrderClose(openOrderId)
      setTable(tableLabel, null) // table still selected, but no saved tab now
    } else {
      void window.pos.openOrderSave({ id: openOrderId, tableLabel: tableLabel ?? undefined, note, staffName: staff?.name, lines: next })
    }
  }
  const chQty = (i: number, d: number) => {
    const next = lines.map((l, j) => (j === i ? { ...l, qty: Math.max(0, l.qty + d) } : l)).filter((l) => l.qty > 0)
    changeQty(i, d)
    syncTab(next)
  }
  const stQty = (i: number, v: number) => {
    const q = Math.max(1, Math.floor(v || 1))
    setQty(i, q)
    syncTab(lines.map((l, j) => (j === i ? { ...l, qty: q } : l)))
  }
  const removeAt = (i: number) => {
    const l = lines[i]
    if (l?.sent && !window.confirm(`"${l.name}" was already sent to the kitchen. Remove it from the order?`)) return
    const next = lines.filter((_, j) => j !== i)
    removeLine(i)
    syncTab(next)
  }
  const clearOrCancel = async () => {
    if (tableLabel) {
      if (!window.confirm(`Cancel ${tableLabel}'s order and free the table?`)) return
      if (openOrderId) await window.pos.openOrderClose(openOrderId)
      clear()
      onTables()
      return
    }
    clear()
  }
  const [showDisc, setShowDisc] = useState(false)
  const [showCust, setShowCust] = useState(false)
  const [showFee, setShowFee] = useState(false)
  const [showCalc, setShowCalc] = useState(false)
  const [showHeld, setShowHeld] = useState(false)
  const [reprinting, setReprinting] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)
  const qtyTotal = lines.reduce((s, l) => s + l.qty, 0)
  const discAmt = discount ? (discount.type === 'flat' ? discount.value : (subtotal * discount.value) / 100) : 0
  const net = Math.max(0, subtotal - discAmt) + feeAmount(fee, subtotal)
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
          <button
            key={o.k}
            className={`otype${orderType === o.k ? ' on' : ''}`}
            onClick={() => (o.k === 'table' ? onTables() : setOrderType(o.k))}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="cart-top">
        <span className="num">{tableLabel ? `🍽 ${tableLabel}` : `# ${lines.length ? 1 : 0}`}</span>
        <button className="icon-btn danger" onClick={clearOrCancel} title={tableLabel ? 'Cancel table' : 'Clear order'} disabled={!lines.length}>
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
                <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => chQty(i, -1)}>
                  −
                </button>
                <input
                  className="qtybox"
                  type="number"
                  min={1}
                  value={l.qty}
                  onChange={(e) => stQty(i, Number(e.target.value))}
                />
                <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => chQty(i, +1)}>
                  ＋
                </button>
                {l.sent && <span className="cr-sent" title="Already sent to the kitchen">✓ sent</span>}
              </div>
            </div>
            <div className="cr-amt">${(l.price * l.qty).toFixed(2)}</div>
            <button className="icon-btn danger" style={{ width: 28, height: 28, flex: '0 0 auto' }} onClick={() => removeAt(i)} title="Remove item">
              🗑
            </button>
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
            ＋ Fee{fee ? ` (${fee.type === 'percent' ? `${fee.value}%` : `$${feeAmount(fee, subtotal).toFixed(2)}`})` : ''}
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
        {openOrderId != null && (
          <button className="reprint-prep" onClick={reprintPrepare} disabled={reprinting} title="Re-print the kitchen prepare list for this table">
            {reprinting ? 'Sending…' : '🖨 Re-print prepare list'}
          </button>
        )}
        <div className="hold-pay">
          {tableLabel ? (
            <button
              className="hold-btn"
              style={{ flex: 1, width: 'auto', background: '#0a8a3f', color: '#fff' }}
              onClick={sendKitchen}
              disabled={!lines.length}
            >
              🍳 Send to Kitchen
            </button>
          ) : (
            <button className="hold-btn" onClick={hold} disabled={!lines.length}>
              ✋ Hold
            </button>
          )}
          <button className="pay-btn" onClick={onPay} disabled={!lines.length}>
            <span>${net.toFixed(2)}</span>
            <span>Pay Now ▸</span>
          </button>
        </div>
      </div>

      {showDisc && <DiscountModal subtotal={subtotal} onClose={() => setShowDisc(false)} />}
      {showCust && <CustomerModal onClose={() => setShowCust(false)} />}
      {showFee && <FeeModal subtotal={subtotal} onClose={() => setShowFee(false)} />}
      {showCalc && <CalculatorModal onClose={() => setShowCalc(false)} />}
      {showHeld && <HeldOrdersModal onClose={() => setShowHeld(false)} />}
    </div>
  )
}
