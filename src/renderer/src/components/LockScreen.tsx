import { useEffect, useState } from 'react'

// Local terminal lock. The WP login stays stored — staff just tap a 4-digit PIN
// to unlock the till (and it auto-locks when idle). First run sets the PIN.
export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [stage, setStage] = useState<'loading' | 'enter' | 'set' | 'confirm'>('loading')
  const [pin, setPin] = useState('')
  const [first, setFirst] = useState('')
  const [err, setErr] = useState('')
  const [shake, setShake] = useState(false)

  useEffect(() => {
    window.pos.pinStatus().then((s) => setStage(s.set ? 'enter' : 'set'))
  }, [])

  useEffect(() => {
    if (pin.length < 4) return
    const entered = pin
    if (stage === 'enter') {
      window.pos.pinVerify(entered).then((r) => (r.ok ? onUnlock() : fail('Wrong PIN — try again')))
    } else if (stage === 'set') {
      setFirst(entered)
      setErr('')
      setPin('')
      setStage('confirm')
    } else if (stage === 'confirm') {
      if (entered === first) window.pos.pinSet(entered).then(() => onUnlock())
      else {
        fail("PINs didn't match — set it again")
        setFirst('')
        setStage('set')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin])

  const fail = (m: string) => {
    setErr(m)
    setShake(true)
    setTimeout(() => {
      setShake(false)
      setPin('')
    }, 350)
  }

  const digit = (d: string) => setPin((p) => (p.length < 4 ? p + d : p))
  const back = () => setPin((p) => p.slice(0, -1))
  const title = stage === 'enter' ? 'Enter PIN to unlock' : stage === 'set' ? 'Set a 4-digit PIN' : 'Re-enter to confirm'

  return (
    <div className="lock">
      <style>{LOCK_CSS}</style>
      <div className="lock-brand">Opal POS</div>
      <div className="lock-title">{title}</div>
      <div className={`lock-dots${shake ? ' shake' : ''}`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`lock-dot${i < pin.length ? ' on' : ''}`} />
        ))}
      </div>
      <div className="lock-err">{err}</div>
      <div className="lock-pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
          <button key={n} type="button" className="lock-key" onClick={() => digit(n)}>
            {n}
          </button>
        ))}
        <span />
        <button type="button" className="lock-key" onClick={() => digit('0')}>
          0
        </button>
        <button type="button" className="lock-key act" onClick={back}>
          ⌫
        </button>
      </div>
    </div>
  )
}

const LOCK_CSS = `
.lock{position:fixed;inset:0;z-index:10000;background:#0a1f4d;color:#fff;display:flex;flex-direction:column;
 align-items:center;justify-content:center;gap:14px;user-select:none}
.lock-brand{font-size:24px;font-weight:800;letter-spacing:.5px}
.lock-title{font-size:16px;opacity:.8}
.lock-dots{display:flex;gap:18px;margin:8px 0}
.lock-dots.shake{animation:lshake .35s}
@keyframes lshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-9px)}75%{transform:translateX(9px)}}
.lock-dot{width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.5)}
.lock-dot.on{background:#fff;border-color:#fff}
.lock-err{min-height:20px;color:#ffb4b4;font-size:14px}
.lock-pad{display:grid;grid-template-columns:repeat(3,84px);gap:16px}
.lock-key{height:84px;border-radius:50%;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.08);
 color:#fff;font-size:28px;font-weight:600;cursor:pointer;-webkit-tap-highlight-color:transparent}
.lock-key:active{background:rgba(255,255,255,.22)}
.lock-key.act{font-size:22px}
`
