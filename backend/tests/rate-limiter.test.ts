import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  checkAndIncrementQuota,
  deriveAnonymousIdentifier
} from '../src/middleware/rate-limiter'
import { filterResponseForRole } from '../src/middleware/role-filter'
import type { AnalysisResult, KVNamespace } from '../src/ai/types'

function createMockKv(initial: Record<string, string> = {}): KVNamespace & {
  get: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
} {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    })
  }
}

function makeFullAnalysis(): AnalysisResult {
  return {
    summary: {
      headline: 'Repo',
      whatItIs: 'desc',
      whyItMatters: 'matters',
      practicalUse: 'use',
      targetAudience: 'devs',
      stackPills: ['TypeScript', 'Vitest']
    },
    architectureDiagram: 'graph TD; A-->B;',
    deepAudit: {
      strengths: ['Good'],
      concerns: ['None']
    },
    providerUsed: 'gemini',
    tokensConsumed: 100
  }
}

describe('Rate Limiter & Anti-Abuse', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-17T12:34:56.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('allows first anonymous request, increments count, and sets 86400s TTL on UTC date key', async () => {
    const mockKv = createMockKv()

    const res = await checkAndIncrementQuota('anon-hash-1', false, mockKv)

    expect(res).toEqual({ allowed: true, remaining: 14 })
    expect(mockKv.get).toHaveBeenCalledTimes(1)
    expect(mockKv.get).toHaveBeenCalledWith('quota:2026-11-17:anon-hash-1')
    expect(mockKv.put).toHaveBeenCalledWith(
      'quota:2026-11-17:anon-hash-1',
      '1',
      { expirationTtl: 86400 }
    )
  })

  it('blocks anonymous user after 15 requests without calling kv.put', async () => {
    const mockKv = createMockKv({ 'quota:2026-11-17:anon-hash-1': '15' })

    const res = await checkAndIncrementQuota('anon-hash-1', false, mockKv)

    expect(res).toEqual({ allowed: false, remaining: 0 })
    expect(mockKv.get).toHaveBeenCalledTimes(1)
    expect(mockKv.put).not.toHaveBeenCalled()
  })

  it('allows Pro user up to 250 requests and blocks at 250', async () => {
    const kvBelow = createMockKv({ 'quota:2026-11-17:user-pro-1': '249' })
    const allowedRes = await checkAndIncrementQuota('user-pro-1', true, kvBelow)

    expect(allowedRes).toEqual({ allowed: true, remaining: 0 })
    expect(kvBelow.put).toHaveBeenCalledWith(
      'quota:2026-11-17:user-pro-1',
      '250',
      { expirationTtl: 86400 }
    )

    const kvAtLimit = createMockKv({ 'quota:2026-11-17:user-pro-1': '250' })
    const blockedRes = await checkAndIncrementQuota('user-pro-1', true, kvAtLimit)

    expect(blockedRes).toEqual({ allowed: false, remaining: 0 })
    expect(kvAtLimit.put).not.toHaveBeenCalled()
  })

  it('supports custom freeLimit and proLimit overrides via options', async () => {
    const kvFree = createMockKv({ 'quota:2026-11-17:anon-custom': '2' })
    const freeRes = await checkAndIncrementQuota('anon-custom', false, kvFree, { freeLimit: 2 })
    expect(freeRes).toEqual({ allowed: false, remaining: 0 })

    const kvPro = createMockKv({ 'quota:2026-11-17:pro-custom': '9' })
    const proRes = await checkAndIncrementQuota('pro-custom', true, kvPro, { proLimit: 10 })
    expect(proRes).toEqual({ allowed: true, remaining: 0 })
  })

  it('derives anonymous identifier using trusted CF-Connecting-IP and ignores spoofed X-Forwarded-For', async () => {
    const req1 = new Request('https://api.example.com/analyze', {
      headers: {
        'CF-Connecting-IP': '203.0.113.10',
        'X-Forwarded-For': '1.1.1.1',
        'X-Client-Signature': 'sig-abc'
      }
    })
    const req2 = new Request('https://api.example.com/analyze', {
      headers: {
        'CF-Connecting-IP': '203.0.113.10',
        'X-Forwarded-For': '9.9.9.9',
        'X-Client-Signature': 'sig-abc'
      }
    })
    const reqDifferentIp = new Request('https://api.example.com/analyze', {
      headers: {
        'CF-Connecting-IP': '203.0.113.99',
        'X-Forwarded-For': '1.1.1.1',
        'X-Client-Signature': 'sig-abc'
      }
    })

    const id1 = await deriveAnonymousIdentifier(req1)
    const id2 = await deriveAnonymousIdentifier(req2)
    const idDifferentIp = await deriveAnonymousIdentifier(reqDifferentIp)

    expect(id1).toMatch(/^anon-[0-9a-f]{64}$/)
    expect(id1).toBe(id2)
    expect(id1).not.toBe(idDifferentIp)
  })

  it('falls back to 0.0.0.0 when CF-Connecting-IP is absent even if X-Forwarded-For is set', async () => {
    const reqNoCfWithXff = new Request('https://api.example.com/analyze', {
      headers: {
        'X-Forwarded-For': '8.8.8.8',
        'X-Client-Signature': 'sig-xyz'
      }
    })
    const reqExplicitFallback = new Request('https://api.example.com/analyze', {
      headers: {
        'CF-Connecting-IP': '0.0.0.0',
        'X-Client-Signature': 'sig-xyz'
      }
    })

    const idNoCf = await deriveAnonymousIdentifier(reqNoCfWithXff)
    const idFallback = await deriveAnonymousIdentifier(reqExplicitFallback)

    expect(idNoCf).toBe(idFallback)
  })
})

describe('Role-Based Response Filter', () => {
  it('strips architectureDiagram and deepAudit for Free users without mutating input', () => {
    const fullAnalysis = makeFullAnalysis()
    const filtered = filterResponseForRole(fullAnalysis, false)

    expect(filtered.summary).toEqual(fullAnalysis.summary)
    expect(filtered.providerUsed).toBe('gemini')
    expect(filtered.tokensConsumed).toBe(100)
    expect('architectureDiagram' in filtered).toBe(false)
    expect('deepAudit' in filtered).toBe(false)
    expect((filtered as AnalysisResult).architectureDiagram).toBeUndefined()
    expect((filtered as AnalysisResult).deepAudit).toBeUndefined()

    // Mutating filtered output must not mutate original input
    filtered.summary.stackPills.push('Mutated')
    expect(fullAnalysis.summary.stackPills).toEqual(['TypeScript', 'Vitest'])
    expect(fullAnalysis.architectureDiagram).toBe('graph TD; A-->B;')
    expect(fullAnalysis.deepAudit.strengths).toEqual(['Good'])
  })

  it('returns full cloned analysis including architectureDiagram and deepAudit for Pro users', () => {
    const fullAnalysis = makeFullAnalysis()
    const filtered = filterResponseForRole(fullAnalysis, true) as AnalysisResult

    expect(filtered).toEqual(fullAnalysis)
    expect(filtered).not.toBe(fullAnalysis)
    expect(filtered.summary).not.toBe(fullAnalysis.summary)
    expect(filtered.deepAudit).not.toBe(fullAnalysis.deepAudit)

    filtered.deepAudit.strengths.push('Extra')
    expect(fullAnalysis.deepAudit.strengths).toEqual(['Good'])
  })
})
