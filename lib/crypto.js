/**
 * Image Token Decryption Utilities
 * Uses Web Crypto API (available in Vercel Edge Runtime)
 *
 * Decrypts encrypted image tokens to reveal signed Supabase Storage URLs.
 */

/**
 * Decrypt an image token back to signed URL
 *
 * @param {string} token - Base64 URL-safe encoded encrypted token
 * @param {string} secret - 32-byte encryption secret (IMAGE_TOKEN_SECRET)
 * @returns {Promise<{url: string, exp: number}>} Decrypted image token with URL and expiration
 * @throws {Error} if token is invalid or expired
 */
export async function decryptImageToken(token, secret) {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  // Decode base64 URL
  const combined = base64UrlDecode(token)

  // Extract IV and encrypted data
  const iv = combined.slice(0, 12)
  const encrypted = combined.slice(12)

  // Import decryption key (pad/trim to 32 bytes for AES-256)
  const keyData = encoder.encode(secret.padEnd(32, '0').substring(0, 32))
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  )

  // Parse JSON
  const data = JSON.parse(decoder.decode(decrypted))

  // Verify expiration
  const now = Math.floor(Date.now() / 1000)
  if (data.exp && data.exp < now) {
    throw new Error('Token expired')
  }

  return data
}

/**
 * Base64 URL-safe decoding
 */
function base64UrlDecode(str) {
  // Add padding back
  const padded = str + '=='.substring(0, (4 - str.length % 4) % 4)
  const base64 = padded
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const binary = atob(base64)
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)))
}
