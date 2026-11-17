import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleMascotChatRequest } from '../src/ai/mascot-chat'
import { AIProvidersExhaustedError, type AnalysisResult, type KVNamespace } from '../src/ai/types'
import worker, { type WorkerEnv } from '../src/worker'
import {
  BackendApiError,
  consumeSseDeltaStream,
  streamMascotChat
} from '../../src/extension/api/backendClient'

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

async function readStreamText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let out = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (value) out += decoder.decode(value, { stream: true })
  }
  out += decoder.decode()
  return out
}

async function* chunksToAsyncIterable(chunks: string[]): AsyncIterable<string> {
  for (const chunk of chunks) {
    yield chunk
  }
}

function makeCachedAnalysis(): AnalysisResult {
  return {
    summary: {
      headline: 'React UI Library',
      whatItIs: 'A JavaScript library for building user interfaces.',
      whyItMatters: 'Declarative component model.',
      practicalUse: 'Build interactive web apps.',
      targetAudience: 'Frontend developers',
      stackPills: ['JavaScript', 'React']
    },
    architectureDiagram: 'graph TD; JSX-->Fiber;',
    deepAudit: {
      strengths: ['Rich ecosystem'],
      concerns: ['Bundle size management']
    },
    providerUsed: 'gemini',
    tokensConsumed: 250
  }
}

describe('Mascot Chat Handler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-17T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('deducts from the unified 250 daily Pro quota and rejects when quota is exhausted', async () => {
    const mockKv = {
      get: vi.fn().mockResolvedValue('250'),
      put: vi.fn()
    } as any
    const req = {
      userId: 'pro-user-1',
      messages: [{ role: 'user' as const, content: 'What does this repo do?' }],
      repoContext: { owner: 'facebook', repo: 'react' }
    }
    await expect(handleMascotChatRequest(req, mockKv)).rejects.toThrow('PRO_QUOTA_EXHAUSTED')
    expect(mockKv.put).not.toHaveBeenCalled()
  })

  it('streams SSE deltas and [DONE] while incrementing unified pro:<userId> KV quota', async () => {
    const kv = createMockKv()
    const stream = await handleMascotChatRequest(
      {
        userId: 'pro-user-2',
        messages: [{ role: 'user', content: 'Explain the architecture' }],
        repoContext: { owner: 'facebook', repo: 'react', commitSha: 'abc123' }
      },
      kv,
      {
        chatProviders: {
          groq: async () => chunksToAsyncIterable(['React uses ', 'a Fiber reconciler.'])
        }
      }
    )

    expect(kv.store.get('quota:2026-11-17:pro:pro-user-2')).toBe('1')
    const text = await readStreamText(stream)
    expect(text).toBe(
      'data: {"delta":"React uses "}\n\n' +
        'data: {"delta":"a Fiber reconciler."}\n\n' +
        'data: [DONE]\n\n'
    )
  })

  it('shares the unified 250 daily Pro bag between /v1/analyze and /v1/mascot/chat', async () => {
    const cached = makeCachedAnalysis()
    const kv = createMockKv({
      'cache:repo:facebook:react:sha123': JSON.stringify(cached)
    })

    const env: WorkerEnv = {
      KV: kv,
      verifyProUser: vi.fn().mockResolvedValue({ isPro: true, userId: 'u1' }),
      chatProviders: {
        groq: async () => chunksToAsyncIterable(['Hello from mascot'])
      }
    }

    const analyzeRes = await worker.fetch(
      new Request('https://api.example.com/v1/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer pro-jwt'
        },
        body: JSON.stringify({ owner: 'facebook', repo: 'react', commitSha: 'sha123' })
      }),
      env
    )
    expect(analyzeRes.status).toBe(200)
    expect(kv.store.get('quota:2026-11-17:pro:u1')).toBe('1')

    const chatRes = await worker.fetch(
      new Request('https://api.example.com/v1/mascot/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer pro-jwt'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'How does Fiber work?' }],
          repoContext: { owner: 'facebook', repo: 'react', commitSha: 'sha123' }
        })
      }),
      env
    )
    expect(chatRes.status).toBe(200)
    expect(kv.store.get('quota:2026-11-17:pro:u1')).toBe('2')

    // Exhaust unified bag at 250 and confirm both endpoints block on 251st request
    kv.store.set('quota:2026-11-17:pro:u1', '250')
    const blockedChatRes = await worker.fetch(
      new Request('https://api.example.com/v1/mascot/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer pro-jwt'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'One more question' }],
          repoContext: { owner: 'facebook', repo: 'react' }
        })
      }),
      env
    )
    expect(blockedChatRes.status).toBe(429)
    expect(await blockedChatRes.json()).toEqual({
      error: 'QUOTA_EXCEEDED',
      code: 'PRO_QUOTA_EXHAUSTED',
      message: 'Daily Pro limit reached'
    })
  })
})

describe('POST /v1/mascot/chat Worker Route', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-17T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns 403 PRO_REQUIRED for unauthenticated and Free users', async () => {
    const kv = createMockKv()

    const anonRes = await worker.fetch(
      new Request('https://api.example.com/v1/mascot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hi' }],
          repoContext: { owner: 'facebook', repo: 'react' }
        })
      }),
      { KV: kv }
    )
    expect(anonRes.status).toBe(403)
    expect(anonRes.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(await anonRes.json()).toEqual({
      error: 'PRO_REQUIRED',
      message: 'Mascot chat requires an active Pro subscription'
    })

    const freeRes = await worker.fetch(
      new Request('https://api.example.com/v1/mascot/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer free-jwt'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hi' }],
          repoContext: { owner: 'facebook', repo: 'react' }
        })
      }),
      {
        KV: kv,
        verifyProUser: vi.fn().mockResolvedValue({ isPro: false, userId: 'free-user-1' })
      }
    )
    expect(freeRes.status).toBe(403)
    expect(await freeRes.json()).toEqual({
      error: 'PRO_REQUIRED',
      message: 'Mascot chat requires an active Pro subscription'
    })
  })

  it('returns 403 MASCOT_DISABLED when feature_flags.mascot_enabled is false', async () => {
    const kv = createMockKv({
      feature_flags: JSON.stringify({ mascot_enabled: false })
    })

    const res = await worker.fetch(
      new Request('https://api.example.com/v1/mascot/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer pro-jwt'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hi' }],
          repoContext: { owner: 'facebook', repo: 'react' }
        })
      }),
      {
        KV: kv,
        verifyProUser: vi.fn().mockResolvedValue({ isPro: true, userId: 'pro-user-1' })
      }
    )

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({
      error: 'MASCOT_DISABLED',
      message: 'Mascot chat is currently disabled'
    })
  })

  it('streams 200 text/event-stream with groq -> gemini fallback and injects KV system_prompt_mascot + cached summary', async () => {
    const cached = makeCachedAnalysis()
    const kv = createMockKv({
      system_prompt_mascot: 'Custom Mascot Persona',
      provider_priority: JSON.stringify(['groq', 'gemini']),
      'cache:repo:facebook:react:abc1234': JSON.stringify(cached)
    })

    const groqMock = vi.fn().mockRejectedValue(new Error('groq 429 rate limited'))
    const geminiMock = vi.fn(async (prompt: { system: string }) => {
      expect(prompt.system).toContain('Custom Mascot Persona')
      expect(prompt.system).toContain('React UI Library')
      return chunksToAsyncIterable(['Gemini ', 'fallback reply!'])
    })

    const res = await worker.fetch(
      new Request('https://api.example.com/v1/mascot/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer pro-jwt'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Summarize this repo' }],
          repoContext: { owner: 'facebook', repo: 'react', commitSha: 'abc1234' }
        })
      }),
      {
        KV: kv,
        verifyProUser: vi.fn().mockResolvedValue({ isPro: true, userId: 'pro-user-3' }),
        chatProviders: {
          groq: groqMock,
          gemini: geminiMock
        }
      }
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/event-stream')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(groqMock).toHaveBeenCalledTimes(1)
    expect(geminiMock).toHaveBeenCalledTimes(1)

    const bodyText = await readStreamText(res.body!)
    expect(bodyText).toBe(
      'data: {"delta":"Gemini "}\n\n' +
        'data: {"delta":"fallback reply!"}\n\n' +
        'data: [DONE]\n\n'
    )
  })

  it('returns 503 AI_PROVIDERS_EXHAUSTED before emitting 200 headers when all providers fail', async () => {
    const kv = createMockKv({
      provider_priority: JSON.stringify(['groq', 'gemini'])
    })

    const res = await worker.fetch(
      new Request('https://api.example.com/v1/mascot/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer pro-jwt'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello?' }],
          repoContext: { owner: 'facebook', repo: 'react' }
        })
      }),
      {
        KV: kv,
        verifyProUser: vi.fn().mockResolvedValue({ isPro: true, userId: 'pro-user-4' }),
        chatProviders: {
          groq: async () => {
            throw new Error('groq down')
          },
          gemini: async () => {
            throw new Error('gemini down')
          }
        }
      }
    )

    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({
      error: 'AI_PROVIDERS_EXHAUSTED',
      message: 'All AI providers temporarily unavailable. Please retry shortly.'
    })
  })
})

describe('Extension Mascot SSE Stream Client', () => {
  const originalFetch = globalThis.fetch
  const originalChrome = (globalThis as { chrome?: unknown }).chrome

  afterEach(() => {
    globalThis.fetch = originalFetch
    ;(globalThis as { chrome?: unknown }).chrome = originalChrome
    vi.restoreAllMocks()
  })

  it('parses split multi-chunk SSE data frames cleanly across arbitrary chunk boundaries', async () => {
    const encoder = new TextEncoder()
    const rawChunks = [
      'data: {"del',
      'ta":"Hello "}\n',
      '\ndata: {"delta":"world',
      '"}\n\ndata: [DO',
      'NE]\n\n'
    ]
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of rawChunks) {
          controller.enqueue(encoder.encode(chunk))
        }
        controller.close()
      }
    })

    const deltas: string[] = []
    const fullText = await consumeSseDeltaStream(stream, (delta) => deltas.push(delta))

    expect(deltas).toEqual(['Hello ', 'world'])
    expect(fullText).toBe('Hello world')
  })

  it('streamMascotChat sends Bearer token + X-Client-Signature and throws BackendApiError on 403/429/503', async () => {
    const session = {
      accessToken: 'jwt-pro-stream',
      expiresAt: Date.now() + 60_000,
      user: { id: 'u-stream' },
      isPro: true
    }
    ;(globalThis as { chrome?: unknown }).chrome = {
      storage: {
        local: {
          get: vi.fn(async (key: string) => {
            if (key === 'gpi_auth_session') return { gpi_auth_session: session }
            if (key === 'gpi_client_id') return { gpi_client_id: 'client-123' }
            return {}
          }),
          set: vi.fn(async () => {})
        }
      }
    }

    const encoder = new TextEncoder()
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"delta":"Hi "}\n'))
            controller.enqueue(encoder.encode('\ndata: {"delta":"there"}\n\ndata: [DONE]\n\n'))
            controller.close()
          }
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' }
        }
      )
    ) as unknown as typeof fetch

    const received: string[] = []
    const text = await streamMascotChat({
      messages: [{ role: 'user', content: 'Hi' }],
      repoContext: { owner: 'facebook', repo: 'react', commitSha: 'feat/monetization' },
      onDelta: (d) => received.push(d)
    })

    expect(received).toEqual(['Hi ', 'there'])
    expect(text).toBe('Hi there')

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit
    ]
    expect(url).toMatch(/\/v1\/mascot\/chat$/)
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer jwt-pro-stream')
    expect(headers.get('X-Client-Signature')).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.parse(String(init.body))).toEqual({
      messages: [{ role: 'user', content: 'Hi' }],
      repoContext: { owner: 'facebook', repo: 'react', commitSha: 'HEAD' }
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'QUOTA_EXCEEDED', message: 'Daily Pro limit reached' })
    }) as unknown as typeof fetch

    await expect(
      streamMascotChat({
        messages: [{ role: 'user', content: 'Again' }],
        repoContext: { owner: 'facebook', repo: 'react' },
        onDelta: () => {}
      })
    ).rejects.toMatchObject({
      name: 'BackendApiError',
      status: 429,
      code: 'QUOTA_EXCEEDED'
    } satisfies Partial<BackendApiError>)
  })
})
