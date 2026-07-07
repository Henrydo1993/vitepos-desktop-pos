import { useState, type CSSProperties } from 'react'
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

export function FeeModal({ onClose }: { onClose: () => void }) {
  const { fee, setFee } = useCart()
  const [value, setValue] = useState(fee ? String(fee) : '')
  const apply = () => {
    setFee(Number(value) || 0)
    onClose()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ width: 360 }}>
        <h3 className="modal-title">Surcharge / Fee</h3>
        <div style={readout}>${value || '0'}</div>
        <Numpad value={value} onChange={setValue} />
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn btn-del" onClick={() => { setFee(0); onClose() }}>
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
