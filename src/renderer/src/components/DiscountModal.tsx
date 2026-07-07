import { useState } from 'react'
import { useCart } from '../state/cart'

export function DiscountModal({ onClose }: { onClose: () => void }) {
  const { discount, setDiscount } = useCart()
  const [type, setType] = useState<'percent' | 'flat'>(discount?.type ?? 'percent')
  const [value, setValue] = useState(discount?.value ? String(discount.value) : '')

  const apply = () => {
    const v = Number(value)
    setDiscount(v > 0 ? { type, value: v } : null)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ minWidth: 320 }}>
        <h3 className="modal-title">Discount</h3>
        <div className="seg" style={{ marginBottom: 12 }}>
          <button className={type === 'percent' ? 'on' : ''} onClick={() => setType('percent')}>
            % Percent
          </button>
          <button className={type === 'flat' ? 'on' : ''} onClick={() => setType('flat')}>
            $ Amount
          </button>
        </div>
        <input
          className="pay-input"
          type="number"
          inputMode="decimal"
          placeholder={type === 'percent' ? 'e.g. 10 (%)' : 'e.g. 5.00 ($)'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn btn-del" onClick={() => { setDiscount(null); onClose() }}>
            Remove
          </button>
          <button className="btn btn-theme" style={{ flex: 2 }} onClick={apply}>
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
