// A short, clear "new order" chime, generated with the Web Audio API — no sound file to
// bundle, works offline. Two rising notes (like a doorbell) so staff notice it over kitchen
// noise without it being harsh.
let ctx: AudioContext | null = null

function ac(): AudioContext | null {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = ctx ?? new Ctor()
    if (ctx.state === 'suspended') void ctx.resume() // browsers suspend until a user gesture
    return ctx
  } catch {
    return null
  }
}

export function playChime(): void {
  const context = ac()
  if (!context) return
  const now = context.currentTime
  const notes = [
    { freq: 880, at: 0 }, // A5
    { freq: 1319, at: 0.16 }, // E6
  ]
  for (const n of notes) {
    const osc = context.createOscillator()
    const gain = context.createGain()
    osc.type = 'sine'
    osc.frequency.value = n.freq
    osc.connect(gain)
    gain.connect(context.destination)
    const t = now + n.at
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4)
    osc.start(t)
    osc.stop(t + 0.45)
  }
}

// Prime the audio context on the first user interaction, so the very first order after
// launch can play sound even before anyone has tapped inside the app.
export function primeChime(): void {
  const unlock = () => {
    ac()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
}
