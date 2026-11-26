import { describe, it, expect, vi, beforeEach } from 'vitest'
import worker, { type WorkerEnv } from '../src/worker'
import type { KVNamespace } from '../src/ai/types'

function createMockKv(initial: Record<string, string> = {}): KVNamespace & {
  get: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  store: Map<string, string>
} {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    })
  }
}

describe('POST /v1/feedback endpoint', () => {
  let kv: ReturnType<typeof createMockKv>
  let env: WorkerEnv

  beforeEach(() => {
    kv = createMockKv()
    env = {
      KV: kv,
      SUPABASE_URL: 'https://test-project.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      ENVIRONMENT: 'test',
    }
    vi.restoreAllMocks()
  })

  it('handles CORS OPTIONS preflight request', async () => {
    const req = new Request('https://api.example.com/v1/feedback', {
      method: 'OPTIONS',
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST')
  })

  it('rejects GET method with 404 Route Not Found', async () => {
    const req = new Request('https://api.example.com/v1/feedback', {
      method: 'GET',
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(404)
  })

  it('validates required fields: missing repo returns 400', async () => {
    const req = new Request('https://api.example.com/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: 'positive' }),
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(400)
    const data = await res.json() as { error: string }
    expect(data.error).toBe('INVALID_REQUEST')
  })

  it('validates rating: invalid rating string returns 400', async () => {
    const req = new Request('https://api.example.com/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: 'facebook/react', rating: 'so-so' }),
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(400)
    const data = await res.json() as { error: string }
    expect(data.error).toBe('INVALID_REQUEST')
  })

  it('accepts valid positive feedback and stores in KV', async () => {
    const pendingPromises: Promise<unknown>[] = []
    const ctx = {
      waitUntil: (promise: Promise<unknown>) => {
        pendingPromises.push(promise)
      },
      passThroughOnException: () => {}
    } as unknown as ExecutionContext

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => '[]',
    })

    const req = new Request('https://api.example.com/v1/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Signature': 'fingerprint-123',
      },
      body: JSON.stringify({
        repo: 'facebook/react',
        rating: 'positive',
        category: 'diagram',
        location: 'architecture',
        comment: 'Great mermaid diagram!',
        provider: 'cfAi',
      }),
    })

    const res = await worker.fetch(req, env, ctx)
    expect(res.status).toBe(201)
    const data = await res.json() as { success: boolean; id: string }
    expect(data.success).toBe(true)
    expect(typeof data.id).toBe('string')

    // Wait for ctx.waitUntil promises
    await Promise.all(pendingPromises)

    // Verify KV storage
    const rawKv = await kv.get('recent_user_feedback')
    expect(rawKv).not.toBeNull()
    const storedList = JSON.parse(rawKv!) as Array<{
      id: string
      repo: string
      rating: string
      category: string
      location: string
      comment: string
      provider: string
    }>
    expect(storedList).toHaveLength(1)
    expect(storedList[0].repo).toBe('facebook/react')
    expect(storedList[0].rating).toBe('positive')
    expect(storedList[0].category).toBe('diagram')
    expect(storedList[0].location).toBe('architecture')
    expect(storedList[0].comment).toBe('Great mermaid diagram!')
    expect(storedList[0].provider).toBe('cfAi')
  })

  it('accepts negative feedback with comment and category mascot', async () => {
    const pendingPromises: Promise<unknown>[] = []
    const ctx = {
      waitUntil: (promise: Promise<unknown>) => {
        pendingPromises.push(promise)
      },
      passThroughOnException: () => {}
    } as unknown as ExecutionContext

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => '[]',
    })

    const req = new Request('https://api.example.com/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo: 'vercel/next.js',
        rating: 'negative',
        category: 'mascot',
        comment: 'Too verbose in answers',
      }),
    })

    const res = await worker.fetch(req, env, ctx)
    expect(res.status).toBe(201)
    const data = await res.json() as { success: boolean; id: string }
    expect(data.success).toBe(true)

    await Promise.all(pendingPromises)

    const rawKv = await kv.get('recent_user_feedback')
    const storedList = JSON.parse(rawKv!) as Array<{ rating: string; category: string; comment: string }>
    expect(storedList[0].rating).toBe('negative')
    expect(storedList[0].category).toBe('mascot')
    expect(storedList[0].comment).toBe('Too verbose in answers')
  })
})
