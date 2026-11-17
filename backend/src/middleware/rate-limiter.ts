import type { KVNamespace } from '../ai/types'

export type { KVNamespace } from '../ai/types'

export interface QuotaOptions {
  freeLimit?: number
  proLimit?: number
}

export interface QuotaCheckResult {
  allowed: boolean
  remaining: number
}

const DEFAULT_FREE_LIMIT = 15
const DEFAULT_PRO_LIMIT = 250
const QUOTA_TTL_SECONDS = 86400

function buildQuotaKey(identifier: string): string {
  const utcDate = new Date().toISOString().slice(0, 10)
  return `quota:${utcDate}:${identifier}`
}

/**
 * Checks and increments the daily UTC request quota for an identifier in KV.
 * Performs a single KV read and skips writing when the quota is already exhausted.
 */
export async function checkAndIncrementQuota(
  identifier: string,
  isPro: boolean,
  kv: KVNamespace,
  options?: QuotaOptions
): Promise<QuotaCheckResult> {
  const limit = isPro
    ? (options?.proLimit ?? DEFAULT_PRO_LIMIT)
    : (options?.freeLimit ?? DEFAULT_FREE_LIMIT)
  const key = buildQuotaKey(identifier)
  const rawCount = await kv.get(key)
  const parsed = rawCount === null ? 0 : Number.parseInt(rawCount, 10)
  const currentCount = Number.isFinite(parsed) && parsed > 0 ? parsed : 0

  if (currentCount >= limit) {
    return { allowed: false, remaining: 0 }
  }

  const nextCount = currentCount + 1
  await kv.put(key, String(nextCount), { expirationTtl: QUOTA_TTL_SECONDS })

  return {
    allowed: true,
    remaining: Math.max(0, limit - nextCount)
  }
}

/**
 * Derives a deterministic anonymous rate-limit identifier from trusted Cloudflare
 * client IP (`CF-Connecting-IP`, ignoring spoofable `X-Forwarded-For`) and
 * `X-Client-Signature` using SHA-256.
 */
export async function deriveAnonymousIdentifier(request: Request): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP')?.trim() || '0.0.0.0'
  const signature = request.headers.get('X-Client-Signature')?.trim() || ''
  const payload = new TextEncoder().encode(`${ip}:${signature}`)
  const digest = await crypto.subtle.digest('SHA-256', payload)
  const hexHash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  return `anon-${hexHash}`
}
