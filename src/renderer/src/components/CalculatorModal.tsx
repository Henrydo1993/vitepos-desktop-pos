import { useState } from 'react'

// Simple two-operand calculator (no eval — CSP-safe). For staff quick maths.
export function CalculatorModal({ onClose }: { onClose: () => void }) {
  const [cur, setCur] = useState('0')
  const [acc, setAcc] = useState<number | null>(null)
  const [op, setOp] = useState<string | null>(null)
  const [fresh, setFresh] = useState(true)

  const round = (n: number) => Math.round(n * 1e6) / 1e6
  const calc = (a: number, b: number, o: string) =>
    o === '+' ? a + b : o === '−' ? a - b : o === '×' ? a * b : b === 0 ? NaN : a / b

  const digit = (d: string) => {
    setCur((c) => (fresh || c === '0' ? (d === '.' ? '0.' : d) : c.includes('.') && d === '.' ? c : c + d))
    setFresh(false)
  }
  const operator = (o: string) => {
    if (acc !== null && op && !fresh) {
      const r = round(calc(acc, Number(cur), op))
      setAcc(r)
      setCur(String(r))
    } else setAcc(Number(cur))
    setOp(o)
    setFresh(true)
  }
  const equals = () => {
    if (acc === null || !op) return
    const r = round(calc(acc, Number(cur), op))
    setCur(String(Number.isFinite(r) ? r : 0))
    setAcc(null)
    setOp(null)
    setFresh(true)
  }
  const clear = () => {
    setCur('0')
    setAcc(null)
    setOp(null)
    setFresh(true)
  }
  const back = () => setCur((c) => (c.length > 1 ? c.slice(0, -1) : '0'))

  const opBtn = (o: string) => (
    <button className={`calc-key op${op === o && fresh ? ' on' : ''}`} onClick={() => operator(o)}>
      {o}
    </button>
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ width: 320 }}>
        <style>{CALC_CSS}</style>
        <h3 className="modal-title">Calculator</h3>
        <div className="calc-screen">{cur}</div>
        <div className="calc-grid">
          <button className="calc-key act" onClick={clear}>
            C
          </button>
          <button className="calc-key act" onClick={back}>
            ⌫
          </button>
          {opBtn('÷')}
          {opBtn('×')}
          {['7', '8', '9'].map((n) => (
            <button key={n} className="calc-key" onClick={() => digit(n)}>
              {n}
            </button>
          ))}
          {opBtn('−')}
          {['4', '5', '6'].map((n) => (
            <button key={n} className="calc-key" onClick={() => digit(n)}>
              {n}
            </button>
          ))}
          {opBtn('+')}
          {['1', '2', '3'].map((n) => (
            <button key={n} className="calc-key" onClick={() => digit(n)}>
              {n}
            </button>
          ))}
          <button className="calc-key eq" style={{ gridRow: 'span 2' }} onClick={equals}>
            =
          </button>
          <button className="calc-key" style={{ gridColumn: 'span 2' }} onClick={() => digit('0')}>
            0
          </button>
          <button className="calc-key" onClick={() => digit('.')}>
            .
          </button>
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

const CALC_CSS = `
.calc-screen{height:56px;border:1px solid var(--vt-border);border-radius:10px;background:#0f172a;color:#fff;
 display:flex;align-items:center;justify-content:flex-end;padding:0 16px;font-size:28px;font-weight:700;
 margin-bottom:12px;font-variant-numeric:tabular-nums;overflow:hidden}
.calc-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.calc-key{height:54px;border:1px solid var(--vt-border);border-radius:10px;background:#fff;font-size:20px;
 font-weight:600;color:#1f2430;cursor:pointer}
.calc-key:active{background:#eef1f6}
.calc-key.act{background:#f2f4f8;color:#6b7280;font-size:16px}
.calc-key.op{background:#eaf1ff;color:#1e3a8a;font-weight:800}
.calc-key.op.on{background:#1e3a8a;color:#fff}
.calc-key.eq{background:#0a8a3f;color:#fff;font-weight:800}
`
