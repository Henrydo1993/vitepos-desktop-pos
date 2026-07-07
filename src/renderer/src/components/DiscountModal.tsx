import { useMemo, useState, type CSSProperties } from 'react'
import { useCart } from '../state/cart'
import { Numpad } from './Numpad'

const readout: CSSProperties = {
  height: 48,
  border: '1px solid var(--vt-border)',
  borderRadius: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  padding: '0 14px',
  fontSize: 22,
  fontWeight: 800,
  marginBottom: 12,
  background: '#f8fafc',
}

export function DiscountModal({ onClose, subtotal }: { onClose: () => void; subtotal: number }) {
  const { discount, setDiscount } = useCart()
  const [type, setType] = useState<'percent' | 'flat'>(discount?.type ?? 'percent')
  const [value, setValue] = useState(discount?.value ? String(discount.value) : '')

  const preview = useMemo(() => {
    const v = Number(value) || 0
    return type === 'percent' ? (subtotal * v) / 100 : Math.min(v, subtotal)
  }, [type, value, subtotal])

  const applyPreset = (pct: number) => {
    setDiscount({ type: 'percent', value: pct })
    onClose()
  }
  const apply = () => {
    const v = Number(value)
    setDiscount(v > 0 ? { type, value: v } : null)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
        <h3 className="modal-title">Discount</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
          {[5, 10, 15, 20].map((p) => (
            <button key={p} className="btn" onClick={() => applyPreset(p)}>
              {p}%
            </button>
          ))}
        </div>
        <div className="seg" style={{ marginBottom: 12 }}>
          <button className={type === 'percent' ? 'on' : ''} onClick={() => setType('percent')}>
            % Percent
          </button>
          <button className={type === 'flat' ? 'on' : ''} onClick={() => setType('flat')}>
            $ Amount
          </button>
        </div>
        <div style={readout}>
          {value || '0'}
          {type === 'percent' ? '%' : ''}
        </div>
        <Numpad value={value} onChange={setValue} mode={type === 'percent' ? 'integer' : 'decimal'} />
        {preview > 0 && (
          <div style={{ fontSize: 13, color: 'var(--vt-text-2)', marginTop: 10 }}>
            Deducts <b>${preview.toFixed(2)}</b> from ${subtotal.toFixed(2)}
          </div>
        )}
        <div className="btn-row" style={{ marginTop: 12 }}>
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
