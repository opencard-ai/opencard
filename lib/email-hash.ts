/**
 * Hash email with SHA-256 before storing in Redis.
 * This way we never store the actual email in plaintext.
 */
export async function hashEmail(email: string): Promise<string> {
  const normalized = email.toLowerCase().trim();
  // Use Web Crypto API (browser-safe) or Node crypto (server-safe)
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Node.js fallback
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(normalized).digest('hex');
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.toLowerCase().trim());
}
