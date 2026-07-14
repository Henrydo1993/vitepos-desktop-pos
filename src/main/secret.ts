import { safeStorage } from 'electron'

// Secrets (the WooCommerce Application Password) are encrypted at rest with the OS keychain
// via Electron safeStorage — DPAPI on Windows, Keychain on macOS. Stored as "enc:v1:<base64>".
// If encryption isn't available (rare — e.g. a Linux box with no keyring), the value is kept
// as-is so the app still works; migrateSecrets re-encrypts once it becomes available.
const PREFIX = 'enc:v1:'

export function isEncrypted(stored: string): boolean {
  return !!stored && stored.startsWith(PREFIX)
}

export function encryptSecret(plain: string): string {
  if (!plain) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return PREFIX + safeStorage.encryptString(plain).toString('base64')
    }
  } catch {
    /* fall through — store as-is */
  }
  return plain
}

export function decryptSecret(stored: string): string {
  if (!stored) return ''
  if (!isEncrypted(stored)) return stored // legacy plaintext or non-keychain fallback
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice(PREFIX.length), 'base64'))
  } catch {
    return ''
  }
}
