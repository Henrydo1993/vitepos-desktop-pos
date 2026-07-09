import { useEffect, useState } from 'react'
import { useAuth, type Staff } from '../state/auth'

const initials = (n: string) =>
  n.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() || '?'

// Multi-user lock: tap an avatar to switch user fast, enter a 4-digit PIN to sign
// in. First run (no staff) creates the first user. Also the logout target.
export function LockScreen({ onUnlock }: { onUnlock: (s: Staff) => void }) {
  const setStaff = useAuth((s) => s.setStaff)
  const [list, setList] = useState<Staff[] | null>(null)
  const [picked, setPicked] = useState<Staff | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [shake, setShake] = useState(false)

  const refresh = () =>
    window.pos.staffList().then((rows) => {
      setList(rows)
      if (rows.length === 0) setAdding(true)
    })
  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    if (adding || !picked || pin.length < 4) return
    const entered = pin
    window.pos.staffVerify(picked.id, entered).then((r) => {
      if (r.ok && r.staff) {
        setStaff(r.staff)
        onUnlock(r.staff)
      } else fail('Wrong PIN — try again')
    })
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

  const addUser = async () => {
    if (!newName.trim() || pin.length < 4) return setErr('Enter a name and a 4-digit PIN')
    await window.pos.staffAdd(newName.trim(), pin, 'staff')
    setNewName('')
    setPin('')
    setErr('')
    setAdding(false)
    refresh()
  }

  const dots = (
    <div className={`lock-dots${shake ? ' shake' : ''}`}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={`lock-dot${i < pin.length ? ' on' : ''}`} />
      ))}
    </div>
  )
  const pad = (onOk?: () => void) => (
    <div className="lock-pad">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
        <button key={n} type="button" className="lock-key" onClick={() => digit(n)}>
          {n}
        </button>
      ))}
      {onOk ? (
        <button type="button" className="lock-key act" onClick={onOk}>
          ✓
        </button>
      ) : (
        <span />
      )}
      <button type="button" className="lock-key" onClick={() => digit('0')}>
        0
      </button>
      <button type="button" className="lock-key act" onClick={back}>
        ⌫
      </button>
    </div>
  )

  return (
    <div className="lock">
      <style>{LOCK_CSS}</style>
      <div className="lock-brand">Opal POS</div>

      {adding ? (
        <>
          <div className="lock-title">{list && list.length ? 'Add a user' : 'Create the first user'}</div>
          <input className="lock-name" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <div className="lock-title" style={{ fontSize: 13, opacity: 0.7 }}>Choose a 4-digit PIN</div>
          {dots}
          <div className="lock-err">{err}</div>
          {pad(addUser)}
          {list && list.length > 0 && (
            <button className="lock-link" onClick={() => { setAdding(false); setPin(''); setErr('') }}>
              ‹ Back
            </button>
          )}
        </>
      ) : picked ? (
        <>
          <div className="lock-title">Welcome, {picked.name.split(' ')[0]}</div>
          {dots}
          <div className="lock-err">{err}</div>
          {pad()}
          <button className="lock-link" onClick={() => { setPicked(null); setPin(''); setErr('') }}>
            ‹ Switch user
          </button>
        </>
      ) : (
        <>
          <div className="lock-title">Tap your name to sign in</div>
          <div className="lock-grid">
            {(list ?? []).map((s) => (
              <button key={s.id} type="button" className="lock-av" onClick={() => { setPicked(s); setErr('') }}>
                <span className="lock-av-c">{initials(s.name)}</span>
                <span className="lock-av-n">{s.name}</span>
                <span className="lock-av-r">{s.role}</span>
              </button>
            ))}
            <button type="button" className="lock-av add" onClick={() => setAdding(true)}>
              <span className="lock-av-c">＋</span>
              <span className="lock-av-n">Add user</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const LOCK_CSS = `
.lock{position:fixed;inset:0;z-index:10000;background:#0a1f4d;color:#fff;display:flex;flex-direction:column;
 align-items:center;justify-content:center;gap:14px;user-select:none;padding:24px}
.lock-brand{font-size:24px;font-weight:800;letter-spacing:.5px}
.lock-title{font-size:16px;opacity:.85}
.lock-name{width:260px;height:48px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);
 color:#fff;font-size:18px;text-align:center;outline:none}
.lock-name::placeholder{color:rgba(255,255,255,.5)}
.lock-dots{display:flex;gap:18px;margin:4px 0}
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
.lock-grid{display:flex;flex-wrap:wrap;gap:16px;justify-content:center;max-width:640px}
.lock-av{width:130px;display:flex;flex-direction:column;align-items:center;gap:6px;padding:18px 10px;border-radius:16px;
 border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;cursor:pointer}
.lock-av:active{background:rgba(255,255,255,.16)}
.lock-av-c{width:60px;height:60px;border-radius:50%;background:#1e3a8a;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800}
.lock-av.add .lock-av-c{background:rgba(255,255,255,.14)}
.lock-av-n{font-size:15px;font-weight:700}
.lock-av-r{font-size:12px;opacity:.6;text-transform:capitalize}
.lock-link{background:none;border:none;color:rgba(255,255,255,.75);font-size:14px;cursor:pointer;padding:6px}
`
