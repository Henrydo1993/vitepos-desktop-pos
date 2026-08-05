import { useState } from 'react'
import { useCart } from '../state/cart'

// A one-off "open item" for the current order — a name + price the staff type on the spot for
// something not on the menu (e.g. "hot extra cream"). POS only; nothing touches WooCommerce.
export function CustomItemModal({ onClose }: { onClose: () => void }) {
  const addCustom = useCart((s) => s.addCustom)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [qty, setQty] = useState(1)
  const [toKitchen, setToKitchen] = useState(true)

  const p = parseFloat(price)
  const valid = name.trim().length > 0 && Number.isFinite(p) && p >= 0

  const submit = () => {
    if (!valid) return
    addCustom({ name: name.trim(), price: p, qty, toKitchen })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <style>{CI_CSS}</style>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ width: 360 }}>
        <h3 className="modal-title">Custom item</h3>
        <label className="ci-l">
          Name
          <input
            className="ci-in"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Hot extra cream"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </label>
        <label className="ci-l">
          Price ($)
          <input
            className="ci-in"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.10"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </label>
        <div className="ci-row">
          <span>Qty</span>
          <div className="ci-step">
            <button type="button" onClick={() => setQty((n) => Math.max(1, n - 1))}>−</button>
            <span>{qty}</span>
            <button type="button" onClick={() => setQty((n) => Math.min(99, n + 1))}>+</button>
          </div>
        </div>
        <label className="ci-check">
          <input type="checkbox" checked={toKitchen} onChange={(e) => setToKitchen(e.target.checked)} />
          Send to kitchen (print on the prepare ticket)
        </label>
        <div className="ci-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn ci-add" disabled={!valid} onClick={submit}>
            Add{valid ? ` · $${(p * qty).toFixed(2)}` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

const CI_CSS = `
.ci-l{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:700;color:#475569;margin-bottom:12px}
.ci-in{height:44px;border:1px solid var(--vt-border,#e5e8ee);border-radius:9px;padding:0 12px;font-size:16px;color:#0f172a}
.ci-in:focus{outline:none;border-color:var(--vt-main,#1e3a8a)}
.ci-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;font-size:14px;font-weight:700;color:#475569}
.ci-step{display:flex;align-items:center;gap:2px}
.ci-step button{width:38px;height:38px;border:1px solid var(--vt-border,#e5e8ee);background:#fff;border-radius:9px;font-size:20px;line-height:1;cursor:pointer;color:#0f172a}
.ci-step span{min-width:40px;text-align:center;font-size:17px;font-weight:800;color:#0f172a}
.ci-check{display:flex;align-items:center;gap:9px;font-size:14px;color:#334155;margin-bottom:16px;cursor:pointer}
.ci-check input{width:18px;height:18px}
.ci-actions{display:flex;gap:8px}
.ci-actions .btn{flex:1}
.ci-actions .ci-add{background:var(--vt-main,#1e3a8a);color:#fff;border-color:var(--vt-main,#1e3a8a)}
.ci-actions .ci-add:disabled{opacity:.5;cursor:not-allowed}
`
