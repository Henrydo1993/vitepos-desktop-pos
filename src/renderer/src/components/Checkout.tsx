import { useEffect, useState } from 'react'
import { useCart, feeAmount } from '../state/cart'
import { useAuth } from '../state/auth'
import { Numpad } from './Numpad'

interface Totals {
  subtotal: number
  discount: number
  tax: number
  total: number
}
type Method = 'cash' | 'card' | 'other' | 'bank'
const METHODS: { k: Method; label: string; icon: string }[] = [
  { k: 'cash', label: 'Cash', icon: '💵' },
  { k: 'card', label: 'Swipe Machine', icon: '💳' },
  { k: 'other', label: 'Other', icon: '☆' },
  { k: 'bank', label: 'Bank Transfer', icon: '🏦' },
]

// Vitepos-style full-screen checkout that takes over the product area — the cart
// stays visible on the left, exactly like the real Vitepos POS.
export function Checkout({ onClose }: { onClose: () => void }) {
  const { lines, orderType, discount, note, setNote, customer, fee, openOrderId, tableLabel, clear } = useCart()
  const staff = useAuth((s) => s.staff)
  const [totals, setTotals] = useState<Totals | null>(null)
  const [method, setMethod] = useState<Method>('cash')
  const [amtStr, setAmtStr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const pl = lines.map((l) => ({ price: l.price, qty: l.qty, taxRate: l.taxable ? l.tax_rate / 100 : 0 }))
    window.pos.price(pl, discount).then(setTotals)
  }, [lines, discount])

  if (!totals) return null
  const round5 = (n: number) => (Math.round(n / 0.05) * 5) / 100 // AU cash rounds to the nearest 5c
  const isCash = method === 'cash'
  const feeAmt = feeAmount(fee, totals.subtotal)
  const rawTotal = totals.total + feeAmt
  const total = isCash ? round5(rawTotal) : rawTotal
  const rounding = Math.round((total - rawTotal) * 100) / 100
  const amt = Number(amtStr) || 0
  const paid = isCash ? amt : total
  const ret = Math.max(0, paid - total)
  const canPay = isCash ? amt >= total : true

  const quick = [...new Set([total, Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10, Math.ceil(total / 10) * 10 + 10, Math.ceil(total / 50) * 50].map((v) => Math.round(v * 100) / 100))]
    .filter((v) => v >= total)
    .slice(0, 5)

  async function pay() {
    if (!totals) return
    setBusy(true)
    try {
      const { token } = await window.pos.commit({
        items: lines.map((l) => ({ product_id: l.product_id, name: l.name, price: l.price, qty: l.qty, station: l.station, modifiers: l.modifiers })),
        totals: { ...totals, total, tender: paid, change: ret, fee: feeAmt },
        paymentMethod: method,
        orderType,
        note,
        customerId: customer?.id,
        customerName: customer?.name,
        staffName: staff?.name,
        openOrderId: openOrderId ?? undefined,
        tableLabel: tableLabel ?? undefined,
      })
      clear()
      onClose()
      setTimeout(() => alert(`Order #${token} sent to kitchen.${isCash && ret ? `  Return $${ret.toFixed(2)}` : ''}`), 0)
    } catch (e) {
      alert(`Failed: ${(e as Error)?.message ?? e}`)
      setBusy(false)
    }
  }

  return (
    <div className="co">
      <style>{CO_CSS}</style>
      <div className="co-head">
        <button type="button" className="co-back" onClick={onClose}>
          ‹ POS
        </button>
        <div className="co-title">Checkout</div>
        <div style={{ width: 72 }} />
      </div>

      <div className="co-body">
        <div className="co-total">${total.toFixed(2)}</div>
        {isCash && rounding !== 0 && (
          <div className="co-round">Rounded to nearest 5¢ ({rounding > 0 ? '+' : ''}${rounding.toFixed(2)})</div>
        )}

        <div className="co-methods">
          {METHODS.map((m) => (
            <button type="button" key={m.k} className={`co-method${method === m.k ? ' on' : ''}`} onClick={() => setMethod(m.k)}>
              <span className="co-mi">{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        {isCash && (
          <div className="co-quick">
            {quick.map((q) => (
              <button type="button" key={q} className="co-chip" onClick={() => setAmtStr(q.toFixed(2))}>
                ${q.toFixed(2)}
              </button>
            ))}
          </div>
        )}

        <div className="co-two">
          <div className="co-left">
            <div className="co-field">
              <label>Payment Amount ($)</label>
              <div className="co-amt">{isCash ? (amt ? amt.toFixed(2) : '0') : total.toFixed(2)}</div>
            </div>
            <div className="co-field">
              <label>Note</label>
              <input className="co-note" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          {isCash && (
            <div className="co-pad">
              <Numpad value={amtStr} onChange={setAmtStr} />
            </div>
          )}
        </div>
      </div>

      <div className="co-bar">
        <div className="co-return">
          Return <b>${ret.toFixed(2)}</b>
        </div>
        <div className="co-due">${(isCash ? amt : total).toFixed(2)}</div>
        <button type="button" className="co-pay" disabled={busy || !canPay} onClick={pay}>
          {busy ? '…' : '➤ Pay Now'}
        </button>
      </div>
    </div>
  )
}

const CO_CSS = `
.co{display:flex;flex-direction:column;height:100%;background:#fff;overflow:hidden}
.co-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #eef1f5;background:#f7f9fc}
.co-back{background:var(--vt-main,#1e3a8a);color:#fff;border:none;border-radius:9px;padding:9px 14px;font-size:14px;font-weight:700;cursor:pointer}
.co-title{font-size:18px;font-weight:800;color:#0f172a}
.co-body{flex:1;overflow:auto;padding:18px 22px;max-width:840px;width:100%;margin:0 auto}
.co-total{text-align:center;font-size:52px;font-weight:800;color:#0f172a;margin:6px 0 16px;font-variant-numeric:tabular-nums}
.co-round{text-align:center;font-size:13px;color:#64748b;margin:-10px 0 14px}
.co-methods{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}
.co-method{display:flex;flex-direction:column;align-items:center;gap:6px;padding:16px 8px;border:1px solid #e5e8ee;border-radius:14px;background:#f4f7fb;font-size:13px;font-weight:700;color:#334155;cursor:pointer}
.co-method .co-mi{font-size:26px}
.co-method.on{background:var(--vt-main,#1e3a8a);color:#fff;border-color:var(--vt-main,#1e3a8a)}
.co-quick{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:18px}
.co-chip{padding:12px 6px;border:1px solid #c9d8f5;border-radius:10px;background:#eaf1ff;color:#1e3a8a;font-size:15px;font-weight:700;cursor:pointer}
.co-chip:active{background:#dbe7ff}
.co-two{display:flex;gap:22px;align-items:flex-start}
.co-left{flex:1;min-width:0}
.co-pad{width:300px;flex:none}
.co-field{margin-bottom:16px}
.co-field label{display:block;font-size:14px;font-weight:700;color:#334155;margin-bottom:6px}
.co-amt{height:52px;border:1px solid #e5e8ee;border-radius:10px;display:flex;align-items:center;justify-content:flex-end;padding:0 16px;font-size:24px;font-weight:800;color:#0f172a;background:#f8fafc;font-variant-numeric:tabular-nums}
.co-note{width:100%;height:48px;border:1px solid #e5e8ee;border-radius:10px;padding:0 14px;font-size:16px;color:#0f172a}
.co-bar{display:flex;align-items:center;gap:14px;margin:10px auto 18px;max-width:840px;width:calc(100% - 44px);
 background:#fff;border:1px solid #e5e8ee;border-radius:40px;padding:8px 8px 8px 22px;box-shadow:0 6px 20px rgba(0,0,0,.06)}
.co-return{font-size:14px;color:#64748b;white-space:nowrap}
.co-return b{color:#0f172a;font-size:16px;margin-left:4px}
.co-due{flex:1;text-align:center;font-size:22px;font-weight:800;color:#0f172a;font-variant-numeric:tabular-nums}
.co-pay{background:var(--vt-main,#1e3a8a);color:#fff;border:none;border-radius:32px;padding:16px 32px;font-size:17px;font-weight:800;cursor:pointer;white-space:nowrap}
.co-pay:disabled{background:#aab6c8;cursor:default}
`
