// Compact touch numpad for money/quantity entry — used inline inside modals so
// no full keyboard ever has to cover the screen (the restaurant-cloud pattern).
export function Numpad({
  value,
  onChange,
  mode = 'decimal',
}: {
  value: string
  onChange: (next: string) => void
  mode?: 'decimal' | 'integer'
}) {
  const press = (ch: string) => {
    if (ch === '.') {
      if (mode === 'integer' || value.includes('.')) return
      return onChange(value === '' ? '0.' : value + '.')
    }
    const dot = value.indexOf('.')
    if (dot >= 0 && value.length - dot - 1 >= 2) return // cap 2 decimals
    if (value === '0') return onChange(ch) // calculator-style leading-zero strip
    onChange(value + ch)
  }
  const back = () => onChange(value.slice(0, -1))
  const clear = () => onChange('')

  return (
    <div className="np">
      <style>{NP_CSS}</style>
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
        <button key={n} type="button" className="np-key" onClick={() => press(n)}>
          {n}
        </button>
      ))}
      <button type="button" className="np-key act" onClick={clear}>
        C
      </button>
      <button type="button" className="np-key" onClick={() => press('0')}>
        0
      </button>
      {mode === 'decimal' ? (
        <button type="button" className="np-key" onClick={() => press('.')}>
          .
        </button>
      ) : (
        <button type="button" className="np-key act" onClick={back}>
          ⌫
        </button>
      )}
      {mode === 'decimal' && (
        <button type="button" className="np-key act back" style={{ gridColumn: '1 / -1' }} onClick={back}>
          ⌫ Backspace
        </button>
      )}
    </div>
  )
}

const NP_CSS = `
.np{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.np-key{height:58px;border:1px solid var(--vt-border,#d7dbe2);border-radius:12px;background:#fff;
 font-size:23px;font-weight:600;color:var(--vt-ink,#1f2430);cursor:pointer;-webkit-tap-highlight-color:transparent}
.np-key:active{background:#eef1f6;transform:translateY(1px)}
.np-key.act{background:#f2f4f8;font-size:16px;color:var(--vt-text-2,#6b7280)}
.np-key.back{font-size:15px;height:46px}
`
