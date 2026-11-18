import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleMascotChatRequest } from '../src/ai/mascot-chat'
import { AIProvidersExhaustedError, type AnalysisResult, type KVNamespace } from '../src/ai/types'
import worker, { type WorkerEnv } from '../src/worker'
import {
  BackendApiError,
  consumeSseDeltaStream,
  streamMascotChat
} from '../../src/extension/api/backendClient'
import {
  handleAuthRuntimeMessage,
  requestProUpgradeFromContentScript
} from '../../src/extension/auth/supabaseAuth'

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

describe('Mascot Provider HTTP/Binding Streaming Adapters & Lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-17T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('streams SSE deltas from Groq and OpenRouter endpoints via fetch', async () => {
    const encoder = new TextEncoder()
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('api.groq.com')) {
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                encoder.encode('data: {"choices":[{"delta":{"content":"Groq "}}]}\n\n')
              )
              controller.enqueue(
                encoder.encode('data: {"choices":[{"delta":{"content":"live"}}]}\n\ndata: [DONE]\n\n')
              )
              controller.close()
            }
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
        )
      }
      if (url.includes('openrouter.ai')) {
        expect((init?.headers as Record<string, string>)['X-Title']).toBe(
          'GitHub Intelligence Extension'
        )
        return new Response(
          JSON.stringify({ choices: [{ message: { content: 'OpenRouter JSON fallback' } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return new Response('Unexpected', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const kv = createMockKv()
    const groqStream = await handleMascotChatRequest(
      {
        userId: 'pro-http-1',
        messages: [{ role: 'user', content: 'Hi Groq' }],
        repoContext: { owner: 'facebook', repo: 'react' }
      },
      kv,
      { priorityOrder: ['groq'], groqApiKey: 'gsk_test' }
    )
    expect(await readStreamText(groqStream)).toBe(
      'data: {"delta":"Groq "}\n\ndata: {"delta":"live"}\n\ndata: [DONE]\n\n'
    )

    const orStream = await handleMascotChatRequest(
      {
        userId: 'pro-http-1',
        messages: [{ role: 'user', content: 'Hi OpenRouter' }],
        repoContext: { owner: 'facebook', repo: 'react' }
      },
      kv,
      { priorityOrder: ['openRouter'], openRouterApiKey: 'or_test' }
    )
    expect(await readStreamText(orStream)).toBe(
      'data: {"delta":"OpenRouter JSON fallback"}\n\ndata: [DONE]\n\n'
    )
  })

  it('streams SSE deltas and JSON fallback from Gemini and Cloudflare AI binding', async () => {
    const encoder = new TextEncoder()
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      expect(url).toContain('gemini-2.0-flash:streamGenerateContent?alt=sse')
      const headers = init?.headers as Record<string, string>
      expect(headers['x-goog-api-key']).toBe('gem_test')
      const body = JSON.parse(String(init?.body)) as {
        contents: Array<{ role: string; parts: Array<{ text: string }> }>
      }
      expect(body.contents.map((c) => c.role)).toEqual(['user', 'model', 'user'])

      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"candidates":[{"content":{"parts":[{"text":"Gemini "}]}}]}\n\n'
              )
            )
            controller.enqueue(
              encoder.encode(
                'data: {"candidates":[{"content":{"parts":[{"text":"stream"}]}}]}\n\n'
              )
            )
            controller.close()
          }
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const kv = createMockKv()
    const gemStream = await handleMascotChatRequest(
      {
        userId: 'pro-http-2',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi!' },
          { role: 'user', content: 'Explain' }
        ],
        repoContext: { owner: 'vercel', repo: 'next.js' }
      },
      kv,
      { priorityOrder: ['gemini'], geminiApiKey: 'gem_test' }
    )
    expect(await readStreamText(gemStream)).toBe(
      'data: {"delta":"Gemini "}\n\ndata: {"delta":"stream"}\n\ndata: [DONE]\n\n'
    )

    const cfStream = await handleMascotChatRequest(
      {
        userId: 'pro-http-2',
        messages: [{ role: 'user', content: 'Hi CF' }],
        repoContext: { owner: 'vercel', repo: 'next.js' }
      },
      kv,
      {
        priorityOrder: ['cfAi'],
        cfAiBinding: {
          run: vi.fn().mockResolvedValue(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(encoder.encode('data: {"response":"CF "}\n\n'))
                controller.enqueue(encoder.encode('data: {"response":"AI"}\n\ndata: [DONE]\n\n'))
                controller.close()
              }
            })
          )
        }
      }
    )
    expect(await readStreamText(cfStream)).toBe(
      'data: {"delta":"CF "}\n\ndata: {"delta":"AI"}\n\ndata: [DONE]\n\n'
    )
  })

  it('does not abort active SSE streams after the 15s initial-connect timeout and cancels upstream reader on client cancel', async () => {
    const encoder = new TextEncoder()
    const upstreamCancelSpy = vi.fn()
    let upstreamController!: ReadableStreamDefaultController<Uint8Array>

    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      // Initial connect signal should not be aborted once headers resolve
      expect(init?.signal?.aborted).toBe(false)
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            upstreamController = controller
            controller.enqueue(
              encoder.encode('data: {"choices":[{"delta":{"content":"First "}}]}\n\n')
            )
          },
          cancel() {
            upstreamCancelSpy()
          }
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const kv = createMockKv()
    const outStream = await handleMascotChatRequest(
      {
        userId: 'pro-stream-cancel',
        messages: [{ role: 'user', content: 'Stream slowly' }],
        repoContext: { owner: 'facebook', repo: 'react' }
      },
      kv,
      { priorityOrder: ['groq'], groqApiKey: 'gsk_test', timeoutMs: 1000, chunkIdleTimeoutMs: 60_000 }
    )

    const reader = outStream.getReader()
    const first = await reader.read()
    expect(new TextDecoder().decode(first.value)).toBe('data: {"delta":"First "}\n\n')

    // Advance well past the 1s connect timeout; stream must remain alive
    await vi.advanceTimersByTimeAsync(5000)
    upstreamController.enqueue(
      encoder.encode('data: {"choices":[{"delta":{"content":"Second"}}]}\n\n')
    )
    const second = await reader.read()
    expect(new TextDecoder().decode(second.value)).toBe('data: {"delta":"Second"}\n\n')

    // Cancelling the downstream stream cancels the upstream reader
    await reader.cancel()
    expect(upstreamCancelSpy).toHaveBeenCalledTimes(1)
  })

  it('truncates >20 message history so the slice starts on a user turn (never Gemini role: model first)', async () => {
    const encoder = new TextEncoder()
    let capturedRoles: string[] = []

    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        contents: Array<{ role: string; parts: Array<{ text: string }> }>
      }
      capturedRoles = body.contents.map((c) => c.role)
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"OK"}]}}]}\n\n')
            )
            controller.close()
          }
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    // 21 alternating messages: index 0 is 'user', index 1 is 'assistant'.
    // slice(-20) starts at index 1 ('assistant'), which must be shifted off so Gemini starts at 'user'.
    const messages = Array.from({ length: 21 }, (_, idx) => ({
      role: idx % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `msg-${idx}`
    }))

    const kv = createMockKv()
    const stream = await handleMascotChatRequest(
      {
        userId: 'pro-slice-1',
        messages,
        repoContext: { owner: 'facebook', repo: 'react' }
      },
      kv,
      { priorityOrder: ['gemini'], geminiApiKey: 'gem_test' }
    )

    expect(await readStreamText(stream)).toBe('data: {"delta":"OK"}\n\ndata: [DONE]\n\n')
    expect(capturedRoles.length).toBe(19)
    expect(capturedRoles[0]).toBe('user')

    await expect(
      handleMascotChatRequest(
        {
          userId: 'pro-slice-2',
          messages: [{ role: 'assistant', content: 'Only assistant' }],
          repoContext: { owner: 'facebook', repo: 'react' }
        },
        kv,
        { priorityOrder: ['gemini'], geminiApiKey: 'gem_test' }
      )
    ).rejects.toThrow('At least one user message is required')
  })

  it('resolves latest analyzed commitSha pointer in /v1/mascot/chat when commitSha is omitted or HEAD', async () => {
    const cached = makeCachedAnalysis()
    const kv = createMockKv({
      'cache:repo:facebook:react:sha999': JSON.stringify(cached)
    })

    const receivedSummaries: Array<unknown> = []
    const receivedShas: Array<string | undefined> = []

    const env: WorkerEnv = {
      KV: kv,
      verifyProUser: vi.fn().mockResolvedValue({ isPro: true, userId: 'u-latest' }),
      chatProviders: {
        groq: async (prompt) => {
          receivedSummaries.push(prompt.system.includes('React UI Library'))
          const shaLine = prompt.system.split('\n').find((l) => l.startsWith('Commit/Ref:'))
          receivedShas.push(shaLine)
          return chunksToAsyncIterable(['Summary attached!'])
        }
      }
    }

    // Trigger /v1/analyze cache hit to populate cache:repo-latest:facebook:react
    const analyzeRes = await worker.fetch(
      new Request('https://api.example.com/v1/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer pro-jwt'
        },
        body: JSON.stringify({ owner: 'Facebook', repo: 'React', commitSha: 'sha999' })
      }),
      env
    )
    expect(analyzeRes.status).toBe(200)
    expect(kv.store.get('cache:repo-latest:facebook:react')).toBe('sha999')

    // Mascot chat with omitted commitSha resolves summary from pointer
    const chatNoSha = await worker.fetch(
      new Request('https://api.example.com/v1/mascot/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer pro-jwt'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'What does this do?' }],
          repoContext: { owner: 'facebook', repo: 'react' }
        })
      }),
      env
    )
    expect(chatNoSha.status).toBe(200)

    // Mascot chat with HEAD also resolves summary from pointer
    const chatHead = await worker.fetch(
      new Request('https://api.example.com/v1/mascot/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer pro-jwt'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'And architecture?' }],
          repoContext: { owner: 'facebook', repo: 'react', commitSha: 'HEAD' }
        })
      }),
      env
    )
    expect(chatHead.status).toBe(200)
    expect(receivedSummaries).toEqual([true, true])
    expect(receivedShas).toEqual(['Commit/Ref: sha999', 'Commit/Ref: sha999'])
  })
})

describe('Content Script -> Background Pro Upgrade Delegation', () => {
  const originalChrome = (globalThis as { chrome?: unknown }).chrome

  afterEach(() => {
    ;(globalThis as { chrome?: unknown }).chrome = originalChrome
    vi.restoreAllMocks()
  })

  it('delegates INITIATE_PRO_UPGRADE via chrome.runtime.sendMessage when chrome.identity/tabs are absent', async () => {
    const mockSession = {
      accessToken: 'jwt-bg-1',
      user: { id: 'bg-user-1', email: 'pro@example.com' },
      isPro: true
    }
    const sendMessage = vi.fn().mockResolvedValue({ ok: true, session: mockSession })
    ;(globalThis as { chrome?: unknown }).chrome = {
      runtime: { sendMessage }
    }

    const result = await requestProUpgradeFromContentScript()
    expect(sendMessage).toHaveBeenCalledWith(
      { type: 'INITIATE_PRO_UPGRADE' },
      expect.any(Function)
    )
    expect(result).toEqual({ ok: true, session: mockSession })
  })

  it('handleAuthRuntimeMessage executes SIGN_IN_WITH_GITHUB and INITIATE_PRO_UPGRADE in background context', async () => {
    const mockSession = {
      accessToken: 'jwt-bg-2',
      user: { id: 'bg-user-2' },
      isPro: true
    }
    const signIn = vi.fn().mockResolvedValue(mockSession)
    const upgrade = vi.fn().mockResolvedValue(undefined)
    const getSession = vi.fn().mockResolvedValue(mockSession)

    const signInRes = await handleAuthRuntimeMessage(
      { type: 'SIGN_IN_WITH_GITHUB' },
      { signIn }
    )
    expect(signIn).toHaveBeenCalledTimes(1)
    expect(signInRes).toEqual({ ok: true, session: mockSession })

    const upgradeRes = await handleAuthRuntimeMessage(
      { type: 'INITIATE_PRO_UPGRADE' },
      { upgrade, getSession }
    )
    expect(upgrade).toHaveBeenCalledTimes(1)
    expect(getSession).toHaveBeenCalledTimes(1)
    expect(upgradeRes).toEqual({ ok: true, session: mockSession })

    expect(await handleAuthRuntimeMessage({ type: 'OTHER' })).toBeNull()
  })
})
