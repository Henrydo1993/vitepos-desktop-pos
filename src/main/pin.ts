import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'crypto'

// scrypt cost: slow enough to blunt brute-forcing a 4-digit PIN from a stolen DB, fast
// enough that unlocking the till feels instant. Memory ≈ 128 * N * r ≈ 16 MB.
const N = 16384

function safeEq(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b)
}

// Hash a PIN with a fresh per-PIN salt: "scrypt:<saltHex>:<hashHex>".
export function hashPin(pin: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(String(pin), salt, 32, { N })
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
}

// Verify a PIN against a stored hash. Accepts the salted scrypt format AND the legacy
// unsalted sha256 hex, so existing tills keep working until each PIN is re-hashed on use.
export function verifyPin(pin: string, stored: string): boolean {
  if (!stored) return false
  if (stored.startsWith('scrypt:')) {
    const parts = stored.split(':')
    const saltHex = parts[1]
    const hashHex = parts[2]
    if (!saltHex || !hashHex) return false
    const expected = Buffer.from(hashHex, 'hex')
    const actual = scryptSync(String(pin), Buffer.from(saltHex, 'hex'), expected.length, { N })
    return safeEq(expected, actual)
  }
  // Legacy: unsalted sha256 hex.
  const legacy = createHash('sha256').update(String(pin)).digest('hex')
  return safeEq(Buffer.from(legacy), Buffer.from(stored))
}

// True if the stored hash is the old unsalted format — the caller should re-hash on next
// successful verify so PINs migrate to salted scrypt transparently.
export function isLegacyPin(stored: string): boolean {
  return !!stored && !stored.startsWith('scrypt:')
}
