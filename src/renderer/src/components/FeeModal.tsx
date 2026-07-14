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

export function FeeModal({ onClose, subtotal }: { onClose: () => void; subtotal: number }) {
  const { fee, setFee } = useCart()
  const [type, setType] = useState<'percent' | 'flat'>(fee?.type ?? 'flat')
  const [value, setValue] = useState(fee?.value ? String(fee.value) : '')

  const preview = useMemo(() => {
    const v = Number(value) || 0
    return type === 'percent' ? (subtotal * v) / 100 : v
  }, [type, value, subtotal])

  const apply = () => {
    const v = Number(value)
    setFee(v > 0 ? { type, value: v } : null)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
        <h3 className="modal-title">Surcharge / Fee</h3>
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
        <Numpad value={value} onChange={setValue} mode="decimal" />
        {preview > 0 && (
          <div style={{ fontSize: 13, color: 'var(--vt-text-2)', marginTop: 10 }}>
            Adds <b>${preview.toFixed(2)}</b> to ${subtotal.toFixed(2)}
          </div>
        )}
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn btn-del" onClick={() => { setFee(null); onClose() }}>
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
