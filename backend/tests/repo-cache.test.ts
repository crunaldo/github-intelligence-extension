import { describe, it, expect, vi } from 'vitest'
import {
  getCachedAnalysis,
  setCachedAnalysis,
  invalidateCachedAnalysis
} from '../src/cache/repo-cache'
import type { AnalysisResult, KVNamespace } from '../src/ai/types'

function createSampleResult(): AnalysisResult {
  return {
    summary: {
      headline: 'Cached Repo',
      whatItIs: 'A test repository',
      whyItMatters: 'Demonstrates caching',
      practicalUse: 'Testing',
      targetAudience: 'Developers',
      stackPills: ['TypeScript', 'Cloudflare Workers']
    },
    architectureDiagram: 'graph TD; Client-->Worker;',
    deepAudit: {
      strengths: ['Edge cached'],
      concerns: []
    },
    providerUsed: 'gemini',
    tokensConsumed: 256
  }
}

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

describe('Hierarchical Repo Cache', () => {
  it('returns null on cache miss using normalized lowercase owner/repo key', async () => {
    const kv = createMockKv()

    const result = await getCachedAnalysis('OctoCat', 'Hello-World', 'sha123', kv)

    expect(result).toBeNull()
    expect(kv.get).toHaveBeenCalledWith('cache:repo:octocat:hello-world:sha123')
  })

  it('stores analysis with 30-day TTL (2592000s) and retrieves parsed AnalysisResult on hit', async () => {
    const kv = createMockKv()
    const sample = createSampleResult()

    await setCachedAnalysis('OctoCat', 'Hello-World', 'sha123', sample, kv)

    expect(kv.put).toHaveBeenCalledWith(
      'cache:repo:octocat:hello-world:sha123',
      JSON.stringify(sample),
      { expirationTtl: 2592000 }
    )

    const cached = await getCachedAnalysis('octocat', 'hello-world', 'sha123', kv)
    expect(cached).toEqual(sample)
  })

  it('gracefully returns null if cached value is corrupt JSON', async () => {
    const kv = createMockKv({
      'cache:repo:octocat:hello-world:sha123': '{not-valid-json'
    })

    const result = await getCachedAnalysis('OctoCat', 'Hello-World', 'sha123', kv)

    expect(result).toBeNull()
  })

  it('returns null when cached JSON is empty object or malformed AnalysisResult schema', async () => {
    const sample = createSampleResult()
    const invalidPayloads: unknown[] = [
      {},
      { summary: {}, providerUsed: 'gemini', tokensConsumed: 10 },
      { ...sample, summary: { ...sample.summary, stackPills: [123] } },
      { ...sample, summary: { ...sample.summary, headline: null } },
      { ...sample, architectureDiagram: 42 },
      { ...sample, deepAudit: { strengths: 'not-array', concerns: [] } },
      { ...sample, deepAudit: { strengths: [], concerns: [false] } },
      { ...sample, providerUsed: null },
      { ...sample, tokensConsumed: '100' },
      { ...sample, tokensConsumed: null }
    ]

    for (const payload of invalidPayloads) {
      const kv = createMockKv({
        'cache:repo:octocat:hello-world:sha123': JSON.stringify(payload)
      })
      const result = await getCachedAnalysis('OctoCat', 'Hello-World', 'sha123', kv)
      expect(result).toBeNull()
    }
  })

  it('deletes cached entry on invalidateCachedAnalysis', async () => {
    const sample = createSampleResult()
    const kv = createMockKv({
      'cache:repo:octocat:hello-world:sha123': JSON.stringify(sample)
    })

    await invalidateCachedAnalysis('OctoCat', 'Hello-World', 'sha123', kv)

    expect(kv.delete).toHaveBeenCalledWith('cache:repo:octocat:hello-world:sha123')
    const after = await getCachedAnalysis('octocat', 'hello-world', 'sha123', kv)
    expect(after).toBeNull()
  })
})
