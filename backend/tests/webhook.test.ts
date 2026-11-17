import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleLemonSqueezyWebhook } from '../src/webhooks/lemonsqueezy'
import worker, { type WorkerEnv } from '../src/worker'
import { AIProvidersExhaustedError, type AnalysisResult, type KVNamespace } from '../src/ai/types'

async function signPayload(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return Array.from(new Uint8Array(signatureBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

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

function makeSampleAnalysis(providerUsed = 'gemini'): AnalysisResult {
  return {
    summary: {
      headline: 'Awesome Project',
      whatItIs: 'A modular developer tool',
      whyItMatters: 'Saves engineering time',
      practicalUse: 'Run via CLI or extension',
      targetAudience: 'Software engineers',
      stackPills: ['TypeScript', 'Vitest']
    },
    architectureDiagram: 'graph TD; Client-->Worker;',
    deepAudit: {
      strengths: ['Clean modular layout'],
      concerns: ['Needs more integration tests']
    },
    providerUsed,
    tokensConsumed: 320
  }
}

function createMockSupabase() {
  const eq = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn(() => ({ eq }))
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn(() => ({ upsert, update, eq }))
  return { from, upsert, update, eq }
}

describe('Lemon Squeezy Webhook Handler', () => {
  it('activates Pro status on subscription_created event with valid HMAC-SHA256 signature', async () => {
    const mockSupabase = createMockSupabase()
    const event = {
      meta: { event_name: 'subscription_created', custom_data: { user_id: 'user-uuid-123' } },
      data: {
        id: 'sub_123',
        attributes: {
          status: 'active',
          customer_id: 'cust_abc',
          variant_id: 'var_456',
          renews_at: '2026-12-12T00:00:00.000Z'
        }
      }
    }
    const rawBody = JSON.stringify(event)
    const signature = await signPayload(rawBody, 'secret')

    const result = await handleLemonSqueezyWebhook(event, signature, 'secret', mockSupabase)

    expect(result).toEqual({ handled: true, status: 'active' })
    expect(mockSupabase.from).toHaveBeenCalledWith('subscriptions')
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-uuid-123',
        lemon_subscription_id: 'sub_123',
        status: 'active',
        variant_id: 'var_456',
        current_period_end: '2026-12-12T00:00:00.000Z'
      }),
      { onConflict: 'lemon_subscription_id' }
    )
    expect(mockSupabase.from).toHaveBeenCalledWith('profiles')
    expect(mockSupabase.update).toHaveBeenCalledWith({
      is_pro: true,
      lemon_customer_id: 'cust_abc'
    })
    expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'user-uuid-123')
  })

  it('throws INVALID_WEBHOOK_SIGNATURE on invalid or missing signature without mutating Supabase', async () => {
    const mockSupabase = createMockSupabase()
    const event = {
      meta: { event_name: 'subscription_created', custom_data: { user_id: 'user-uuid-123' } },
      data: {
        id: 'sub_123',
        attributes: { status: 'active', customer_id: 'cust_abc', variant_id: 'var_456' }
      }
    }

    await expect(
      handleLemonSqueezyWebhook(event, 'deadbeef', 'secret', mockSupabase)
    ).rejects.toThrow('INVALID_WEBHOOK_SIGNATURE')

    await expect(
      handleLemonSqueezyWebhook(event, '', 'secret', mockSupabase)
    ).rejects.toThrow('INVALID_WEBHOOK_SIGNATURE')

    expect(mockSupabase.from).not.toHaveBeenCalled()
  })

  it('revokes is_pro and updates subscription status on subscription_expired and subscription_cancelled', async () => {
    for (const eventName of ['subscription_expired', 'subscription_cancelled'] as const) {
      const mockSupabase = createMockSupabase()
      const status = eventName === 'subscription_expired' ? 'expired' : 'cancelled'
      const event = {
        meta: { event_name: eventName, custom_data: { user_id: 'user-uuid-999' } },
        data: {
          id: 'sub_999',
          attributes: { status, customer_id: 'cust_999', variant_id: 'var_456' }
        }
      }
      const signature = await signPayload(JSON.stringify(event), 'secret')

      const result = await handleLemonSqueezyWebhook(event, signature, 'secret', mockSupabase)

      expect(result).toEqual({ handled: true, status })
      expect(mockSupabase.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          lemon_subscription_id: 'sub_999',
          status
        }),
        { onConflict: 'lemon_subscription_id' }
      )
      expect(mockSupabase.update).toHaveBeenCalledWith({
        is_pro: false,
        lemon_customer_id: 'cust_999'
      })
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'user-uuid-999')
    }
  })

  it('handles subscription_resumed and duplicate webhook deliveries idempotently', async () => {
    const mockSupabase = createMockSupabase()
    const event = {
      meta: { event_name: 'subscription_resumed', custom_data: { user_id: 'user-uuid-42' } },
      data: {
        id: 'sub_42',
        attributes: { status: 'active', customer_id: 'cust_42', variant_id: 'var_1' }
      }
    }
    const rawBody = JSON.stringify(event)
    const signature = await signPayload(rawBody, 'secret')

    const first = await handleLemonSqueezyWebhook(event, signature, 'secret', mockSupabase, rawBody)
    const second = await handleLemonSqueezyWebhook(event, signature, 'secret', mockSupabase, rawBody)

    expect(first).toEqual({ handled: true, status: 'active' })
    expect(second).toEqual({ handled: true, status: 'active' })
    expect(mockSupabase.upsert).toHaveBeenCalledTimes(2)
    expect(mockSupabase.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ lemon_subscription_id: 'sub_42', status: 'active' }),
      { onConflict: 'lemon_subscription_id' }
    )
    expect(mockSupabase.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ lemon_subscription_id: 'sub_42', status: 'active' }),
      { onConflict: 'lemon_subscription_id' }
    )
  })

  it('revokes is_pro when subscription_updated transitions to past_due', async () => {
    const mockSupabase = createMockSupabase()
    const event = {
      meta: { event_name: 'subscription_updated', custom_data: { user_id: 'user-uuid-77' } },
      data: {
        id: 'sub_77',
        attributes: { status: 'past_due', customer_id: 'cust_77', variant_id: 'var_1' }
      }
    }
    const rawBody = JSON.stringify(event)
    const signature = await signPayload(rawBody, 'secret')

    const result = await handleLemonSqueezyWebhook(event, signature, 'secret', mockSupabase, rawBody)

    expect(result).toEqual({ handled: true, status: 'past_due' })
    expect(mockSupabase.update).toHaveBeenCalledWith({
      is_pro: false,
      lemon_customer_id: 'cust_77'
    })
  })
})

describe('Cloudflare Worker Entrypoint', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-17T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('responds to CORS preflight OPTIONS requests', async () => {
    const env: WorkerEnv = { KV: createMockKv() }
    const req = new Request('https://api.example.com/v1/analyze', { method: 'OPTIONS' })

    const res = await worker.fetch(req, env)

    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST')
  })

  it('GET /v1/config returns remote config from KV with safe defaults', async () => {
    const kvDefault = createMockKv()
    const resDefault = await worker.fetch(new Request('https://api.example.com/v1/config'), {
      KV: kvDefault
    })
    expect(resDefault.status).toBe(200)
    expect(await resDefault.json()).toEqual({
      free_daily_limit: 15,
      pro_daily_limit: 250,
      feature_flags: {
        mascot_enabled: true,
        diagrams_enabled: true,
        maintenance_mode: false
      }
    })

    const kvCustom = createMockKv({
      free_daily_limit: '10',
      pro_daily_limit: '300',
      feature_flags: JSON.stringify({ mascot_enabled: false, maintenance_mode: true })
    })
    const resCustom = await worker.fetch(new Request('https://api.example.com/v1/config'), {
      KV: kvCustom
    })
    expect(resCustom.status).toBe(200)
    expect(await resCustom.json()).toEqual({
      free_daily_limit: 10,
      pro_daily_limit: 300,
      feature_flags: {
        mascot_enabled: false,
        diagrams_enabled: true,
        maintenance_mode: true
      }
    })
  })

  it('POST /v1/analyze rejects path traversal and invalid owner/repo/commitSha with 400', async () => {
    const env: WorkerEnv = { KV: createMockKv() }
    const invalidBodies = [
      { owner: '../etc', repo: 'passwd', commitSha: 'main' },
      { owner: 'octocat', repo: 'repo/../../secret', commitSha: 'abc123' },
      { owner: 'octocat', repo: 'hello', commitSha: '..' },
      { owner: '', repo: 'hello', commitSha: 'abc123' }
    ]

    for (const body of invalidBodies) {
      const req = new Request('https://api.example.com/v1/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const res = await worker.fetch(req, env)
      expect(res.status).toBe(400)
      const json = (await res.json()) as { error: string }
      expect(json.error).toBe('INVALID_REQUEST')
    }
  })

  it('POST /v1/analyze strips Pro fields on cache hit for Free users and includes them for Pro users (Review Focus #5)', async () => {
    const fullResult = makeSampleAnalysis('gemini')
    const kv = createMockKv({
      'cache:repo:octocat:hello-world:abc1234': JSON.stringify(fullResult)
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const freeReq = new Request('https://api.example.com/v1/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.1',
        'X-Client-Signature': 'fp-free'
      },
      body: JSON.stringify({ owner: 'OctoCat', repo: 'Hello-World', commitSha: 'abc1234' })
    })
    const freeRes = await worker.fetch(freeReq, { KV: kv })
    expect(freeRes.status).toBe(200)
    const freeBody = (await freeRes.json()) as Record<string, unknown>
    expect(freeBody.summary).toEqual(fullResult.summary)
    expect('architectureDiagram' in freeBody).toBe(false)
    expect('deepAudit' in freeBody).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()

    const proReq = new Request('https://api.example.com/v1/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-pro-jwt',
        'CF-Connecting-IP': '198.51.100.1'
      },
      body: JSON.stringify({ owner: 'OctoCat', repo: 'Hello-World', commitSha: 'abc1234' })
    })
    const proRes = await worker.fetch(proReq, {
      KV: kv,
      verifyProUser: vi.fn().mockResolvedValue({ isPro: true, userId: 'pro-user-1' })
    })
    expect(proRes.status).toBe(200)
    const proBody = (await proRes.json()) as AnalysisResult
    expect(proBody.architectureDiagram).toBe(fullResult.architectureDiagram)
    expect(proBody.deepAudit).toEqual(fullResult.deepAudit)
  })

  it('POST /v1/analyze enforces anti-rotation IP ceiling (45/day) when X-Client-Signature is rotated (Review Focus #4)', async () => {
    const fullResult = makeSampleAnalysis('gemini')
    const kv = createMockKv({
      'cache:repo:octocat:hello-world:abc1234': JSON.stringify(fullResult)
    })

    for (let i = 0; i < 45; i++) {
      const req = new Request('https://api.example.com/v1/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.55',
          'X-Client-Signature': `forged-sig-${i}`
        },
        body: JSON.stringify({ owner: 'octocat', repo: 'hello-world', commitSha: 'abc1234' })
      })
      const res = await worker.fetch(req, { KV: kv })
      expect(res.status).toBe(200)
    }

    const blockedReq = new Request('https://api.example.com/v1/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '203.0.113.55',
        'X-Client-Signature': 'forged-sig-46'
      },
      body: JSON.stringify({ owner: 'octocat', repo: 'hello-world', commitSha: 'abc1234' })
    })
    const blockedRes = await worker.fetch(blockedReq, { KV: kv })
    expect(blockedRes.status).toBe(429)
    expect(await blockedRes.json()).toEqual({
      error: 'QUOTA_EXCEEDED',
      message: 'Daily free limit reached'
    })
  })

  it('POST /v1/analyze returns 404 REPOSITORY_NOT_ACCESSIBLE when README and manifests are 404 without calling AI (Review Focus #1)', async () => {
    const kv = createMockKv()
    const analyzeRepo = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    const req = new Request('https://api.example.com/v1/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.2',
        'X-Client-Signature': 'sig-1'
      },
      body: JSON.stringify({ owner: 'private', repo: 'secret-repo', commitSha: 'main' })
    })

    const res = await worker.fetch(req, { KV: kv, analyzeRepo })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      error: 'REPOSITORY_NOT_ACCESSIBLE',
      message: 'Public repository README not accessible'
    })
    expect(analyzeRepo).not.toHaveBeenCalled()
  })

  it('POST /v1/analyze returns 503 AI_PROVIDERS_EXHAUSTED and does NOT write to repo cache when all AI providers fail (Review Focus #2)', async () => {
    const kv = createMockKv()
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.endsWith('/README.md')) {
        return new Response('# Public Repo\nDocs here.', { status: 200 })
      }
      if (url.endsWith('/package.json')) {
        return new Response('{"name":"public-repo"}', { status: 200 })
      }
      return new Response('Not Found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const analyzeRepo = vi.fn().mockRejectedValue(
      new AIProvidersExhaustedError([
        { provider: 'gemini', message: '429' },
        { provider: 'groq', message: '503' }
      ])
    )

    const req = new Request('https://api.example.com/v1/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.3',
        'X-Client-Signature': 'sig-2'
      },
      body: JSON.stringify({ owner: 'octocat', repo: 'hello-world', commitSha: 'deadbeef' })
    })

    const res = await worker.fetch(req, { KV: kv, analyzeRepo })

    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({
      error: 'AI_PROVIDERS_EXHAUSTED',
      message: 'All AI providers temporarily unavailable. Please retry shortly.'
    })
    expect(kv.store.has('cache:repo:octocat:hello-world:deadbeef')).toBe(false)
  })

  it('POST /v1/analyze fetches README.md/manifests on cache miss, runs AI router with KV prompt/priority, caches result, and filters response', async () => {
    const fullResult = makeSampleAnalysis('groq')
    const kv = createMockKv({
      system_prompt_repo: 'Custom KV Prompt',
      provider_priority: JSON.stringify(['groq', 'gemini'])
    })
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.endsWith('/README.md')) {
        return new Response('Not Found', { status: 404 })
      }
      if (url.endsWith('/readme.md')) {
        return new Response('# Fallback Readme', { status: 200 })
      }
      if (url.endsWith('/package.json')) {
        return new Response('{"name":"demo"}', { status: 200 })
      }
      return new Response('Not Found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const analyzeRepo = vi.fn().mockResolvedValue(fullResult)

    const req = new Request('https://api.example.com/v1/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.4',
        'X-Client-Signature': 'sig-3'
      },
      body: JSON.stringify({ owner: 'OctoCat', repo: 'Demo', commit_sha: 'sha999' })
    })

    const res = await worker.fetch(req, {
      KV: kv,
      GEMINI_API_KEY: 'gem-key',
      GROQ_API_KEY: 'groq-key',
      analyzeRepo
    })

    expect(res.status).toBe(200)
    expect(analyzeRepo).toHaveBeenCalledWith(
      {
        owner: 'OctoCat',
        repo: 'Demo',
        commitSha: 'sha999',
        readme: '# Fallback Readme',
        manifests: { 'package.json': '{"name":"demo"}' }
      },
      expect.objectContaining({
        geminiApiKey: 'gem-key',
        groqApiKey: 'groq-key',
        systemPrompt: 'Custom KV Prompt',
        priorityOrder: ['groq', 'gemini']
      })
    )
    expect(kv.store.has('cache:repo:octocat:demo:sha999')).toBe(true)

    const body = (await res.json()) as Record<string, unknown>
    expect(body.summary).toEqual(fullResult.summary)
    expect('architectureDiagram' in body).toBe(false)
    expect('deepAudit' in body).toBe(false)
  })

  it('POST /v1/webhooks/lemonsqueezy verifies X-Signature and rejects invalid signatures with 401', async () => {
    const kv = createMockKv()
    const mockSupabase = createMockSupabase()
    const event = {
      meta: { event_name: 'subscription_created', custom_data: { user_id: 'user-1' } },
      data: { id: 'sub-1', attributes: { status: 'active', customer_id: 'cust-1', variant_id: 'v-1' } }
    }
    const rawBody = JSON.stringify(event)
    const validSig = await signPayload(rawBody, 'wh-secret')

    const okRes = await worker.fetch(
      new Request('https://api.example.com/v1/webhooks/lemonsqueezy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': validSig
        },
        body: rawBody
      }),
      {
        KV: kv,
        LEMON_SQUEEZY_WEBHOOK_SECRET: 'wh-secret',
        createSupabaseClient: () => mockSupabase
      }
    )
    expect(okRes.status).toBe(200)
    expect(await okRes.json()).toEqual({ handled: true, status: 'active' })

    const badRes = await worker.fetch(
      new Request('https://api.example.com/v1/webhooks/lemonsqueezy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': 'bad-signature'
        },
        body: rawBody
      }),
      {
        KV: kv,
        LEMON_SQUEEZY_WEBHOOK_SECRET: 'wh-secret',
        createSupabaseClient: () => mockSupabase
      }
    )
    expect(badRes.status).toBe(401)
  })

  it('POST /v1/mascot/chat returns HTTP 501 placeholder JSON', async () => {
    const req = new Request('https://api.example.com/v1/mascot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' })
    })
    const res = await worker.fetch(req, { KV: createMockKv() })

    expect(res.status).toBe(501)
    expect(await res.json()).toEqual({
      error: 'NOT_IMPLEMENTED',
      message: 'Mascot chat endpoint wired in Task 6'
    })
  })

  it('POST /v1/analyze blocks anonymous caller after 15/day without burning IP ceiling and enforces 250/day Pro limit', async () => {
    const fullResult = makeSampleAnalysis('gemini')
    const kv = createMockKv({
      'cache:repo:octocat:hello-world:abc1234': JSON.stringify(fullResult)
    })

    for (let i = 0; i < 15; i++) {
      const res = await worker.fetch(
        new Request('https://api.example.com/v1/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '192.0.2.10',
            'X-Client-Signature': 'same-fp'
          },
          body: JSON.stringify({ owner: 'octocat', repo: 'hello-world', commitSha: 'abc1234' })
        }),
        { KV: kv }
      )
      expect(res.status).toBe(200)
    }

    const ipKey = Array.from(kv.store.keys()).find((k) => k.includes(':ip:'))
    expect(ipKey).toBeDefined()
    expect(kv.store.get(ipKey!)).toBe('15')

    const blockedFree = await worker.fetch(
      new Request('https://api.example.com/v1/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '192.0.2.10',
          'X-Client-Signature': 'same-fp'
        },
        body: JSON.stringify({ owner: 'octocat', repo: 'hello-world', commitSha: 'abc1234' })
      }),
      { KV: kv }
    )
    expect(blockedFree.status).toBe(429)
    expect(kv.store.get(ipKey!)).toBe('15')

    kv.store.set('quota:2026-11-17:pro:pro-user-99', '250')
    const blockedPro = await worker.fetch(
      new Request('https://api.example.com/v1/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer pro-jwt'
        },
        body: JSON.stringify({ owner: 'octocat', repo: 'hello-world', commitSha: 'abc1234' })
      }),
      {
        KV: kv,
        verifyProUser: vi.fn().mockResolvedValue({ isPro: true, userId: 'pro-user-99' })
      }
    )
    expect(blockedPro.status).toBe(429)
    expect(await blockedPro.json()).toEqual({
      error: 'QUOTA_EXCEEDED',
      message: 'Daily Pro limit reached'
    })
  })

  it('POST /v1/analyze verifies Bearer JWT against Supabase REST endpoints when verifyProUser is not injected', async () => {
    const fullResult = makeSampleAnalysis('gemini')
    const kv = createMockKv({
      'cache:repo:octocat:hello-world:abc1234': JSON.stringify(fullResult)
    })
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url === 'https://proj.supabase.co/auth/v1/user') {
        return new Response(JSON.stringify({ id: 'supa-user-1' }), { status: 200 })
      }
      if (url === 'https://proj.supabase.co/rest/v1/profiles?id=eq.supa-user-1&select=is_pro') {
        return new Response(JSON.stringify([{ is_pro: true }]), { status: 200 })
      }
      return new Response('Not Found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await worker.fetch(
      new Request('https://api.example.com/v1/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer supa-jwt-token'
        },
        body: JSON.stringify({ owner: 'octocat', repo: 'hello-world', commitSha: 'abc1234' })
      }),
      {
        KV: kv,
        SUPABASE_URL: 'https://proj.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'srv-key'
      }
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as AnalysisResult
    expect(body.architectureDiagram).toBe('graph TD; Client-->Worker;')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
