import { useEffect, useState, type CSSProperties } from 'react'
import { Numpad } from './Numpad'
import { useAuth } from '../state/auth'

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
  margin: '6px 0 12px',
  background: '#f8fafc',
}

interface Summary {
  shift: { opening_float: number }
  orders: number
  gross: number
  byMethod: { method: string; n: number; amt: number }[]
  cashSales: number
  cashExpected: number
}

export function ShiftModal({ mode, onClose, onDone }: { mode: 'open' | 'close'; onClose: () => void; onDone: () => void }) {
  const staff = useAuth((s) => s.staff)
  const [amt, setAmt] = useState('')
  const [busy, setBusy] = useState(false)
  const [sum, setSum] = useState<Summary | null>(null)

  useEffect(() => {
    if (mode === 'close') window.pos.shiftSummary().then((s) => setSum(s as Summary | null))
  }, [mode])

  const start = async () => {
    setBusy(true)
    await window.pos.shiftOpen(Number(amt) || 0, staff?.name)
    onDone()
  }
  const close = async () => {
    setBusy(true)
    await window.pos.shiftClose(amt === '' ? null : Number(amt), staff?.name)
    onDone()
  }

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ width: 430, maxHeight: '92vh', overflow: 'auto' }}>
        <style>{SH_CSS}</style>
        {mode === 'open' ? (
          <>
            <h3 className="modal-title">Start the day</h3>
            <p style={{ color: 'var(--vt-text-2)', marginTop: -6, marginBottom: 8 }}>
              Enter the cash you're putting in the drawer to start. The drawer will open.
            </p>
            <div style={readout}>${amt || '0'}</div>
            <Numpad value={amt} onChange={setAmt} />
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button className="btn btn-theme" style={{ flex: 2 }} onClick={start} disabled={busy}>
                {busy ? '…' : 'Start day'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="modal-title">End of day</h3>
            {!sum ? (
              <div style={{ color: 'var(--vt-text-2)', padding: '10px 0' }}>Loading…</div>
            ) : (
              <>
                <div className="sh-rows">
                  <div className="sh-row">
                    <span>Orders</span>
                    <b>{sum.orders}</b>
                  </div>
                  <div className="sh-row">
                    <span>Gross sales</span>
                    <b>${sum.gross.toFixed(2)}</b>
                  </div>
                  {sum.byMethod.map((m) => (
                    <div className="sh-row sub" key={m.method}>
                      <span className="cap">
                        {m.method} ({m.n})
                      </span>
                      <span>${m.amt.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="sh-sep" />
                  <div className="sh-row">
                    <span>Opening float</span>
                    <span>${sum.shift.opening_float.toFixed(2)}</span>
                  </div>
                  <div className="sh-row">
                    <span>Cash sales</span>
                    <span>${sum.cashSales.toFixed(2)}</span>
                  </div>
                  <div className="sh-row">
                    <span>Cash expected in drawer</span>
                    <b>${sum.cashExpected.toFixed(2)}</b>
                  </div>
                </div>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--vt-text-2)', fontWeight: 600, marginTop: 6 }}>Counted cash (optional)</label>
                <div style={readout}>${amt || '0'}</div>
                <Numpad value={amt} onChange={setAmt} />
                {amt !== '' && (
                  <div className="sh-row" style={{ marginTop: 8 }}>
                    <span>Over / Short</span>
                    <b style={{ color: Number(amt) - sum.cashExpected < 0 ? 'var(--vt-del)' : '#0a8a3f' }}>
                      ${(Number(amt) - sum.cashExpected).toFixed(2)}
                    </b>
                  </div>
                )}
                <div className="btn-row" style={{ marginTop: 12 }}>
                  <button className="btn" onClick={onClose} disabled={busy}>
                    Cancel
                  </button>
                  <button className="btn btn-theme" style={{ flex: 2 }} onClick={close} disabled={busy}>
                    {busy ? '…' : '🖨 Print & close day'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const SH_CSS = `
.sh-rows{border:1px solid var(--vt-border);border-radius:12px;padding:6px 14px;margin-bottom:10px}
.sh-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;font-size:15px;color:#0f172a}
.sh-row.sub{padding:5px 0 5px 12px;color:#64748b;font-size:14px}
.sh-row .cap{text-transform:capitalize}
.sh-sep{border-top:1px solid var(--vt-border);margin:4px 0}
`
