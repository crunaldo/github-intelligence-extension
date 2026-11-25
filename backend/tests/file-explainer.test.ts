import { describe, it, expect, vi, beforeEach } from 'vitest'
import worker, { type WorkerEnv } from '../src/worker'
import {
  parseFileExplanationJson,
  buildFileExplainerPrompt,
  generateFileExplanation
} from '../src/ai/file-explainer'
import type { KVNamespace } from '../src/ai/types'

function createMockKv(initial: Record<string, string> = {}): KVNamespace & {
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

describe('file-explainer AI module', () => {
  it('parses valid structured JSON explanation with code fences', () => {
    const raw = '```json\n{"summary": "Handles auth tokens", "keyResponsibilities": ["Generates JWT", "Validates claims"], "architectureRole": "Auth Service"}\n```'
    const result = parseFileExplanationJson(raw, 'gemini', 150)
    expect(result.explanation.summary).toBe('Handles auth tokens')
    expect(result.explanation.keyResponsibilities).toHaveLength(2)
    expect(result.explanation.architectureRole).toBe('Auth Service')
    expect(result.providerUsed).toBe('gemini')
    expect(result.tokensConsumed).toBe(150)
  })

  it('throws on missing required fields', () => {
    expect(() => parseFileExplanationJson('{}', 'groq')).toThrow(/missing required/i)
    expect(() =>
      parseFileExplanationJson('{"summary": "Test", "keyResponsibilities": []}', 'groq')
    ).toThrow(/missing required/i)
  })

  it('builds prompts with appropriate language directives', () => {
    const promptEs = buildFileExplainerPrompt({
      owner: 'facebook',
      repo: 'react',
      path: 'src/index.js',
      fileContent: 'console.log("hello")',
      locale: 'es'
    })
    expect(promptEs.system).toContain('español')
    expect(promptEs.user).toContain('Repository: facebook/react')

    const promptEn = buildFileExplainerPrompt({
      owner: 'facebook',
      repo: 'react',
      path: 'src/index.js',
      fileContent: 'console.log("hello")',
      locale: 'en'
    })
    expect(promptEn.system).toContain('English')
  })

  it('falls back between providers when first provider fails', async () => {
    const mockGemini = vi.fn().mockRejectedValue(new Error('Gemini 500 error'))
    const mockGroq = vi.fn().mockResolvedValue({
      explanation: {
        summary: 'Fallback explanation from Groq',
        keyResponsibilities: ['Core logic'],
        architectureRole: 'Business Layer'
      },
      providerUsed: 'groq'
    })

    const result = await generateFileExplanation(
      {
        owner: 'test-owner',
        repo: 'test-repo',
        path: 'main.py',
        fileContent: 'print("test")'
      },
      {
        priorityOrder: ['gemini', 'groq'],
        fileProviders: {
          gemini: mockGemini,
          groq: mockGroq
        }
      }
    )

    expect(mockGemini).toHaveBeenCalled()
    expect(mockGroq).toHaveBeenCalled()
    expect(result.providerUsed).toBe('groq')
    expect(result.explanation.summary).toBe('Fallback explanation from Groq')
  })
})

describe('POST /v1/file/explain worker endpoint', () => {
  let mockKv: ReturnType<typeof createMockKv>

  beforeEach(() => {
    mockKv = createMockKv({
      free_daily_limit: '15',
      pro_daily_limit: '250'
    })
  })

  it('validates request payload and returns 400 on missing path', async () => {
    const req = new Request('https://api.test/v1/file/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: 'facebook', repo: 'react' })
    })

    const env: WorkerEnv = { KV: mockKv }
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('INVALID_REQUEST')
  })

  it('deducts from Pro quota using pro_daily_limit and returns remaining count', async () => {
    const mockExplain = vi.fn().mockResolvedValue({
      explanation: {
        summary: 'AI analysis for Pro user',
        keyResponsibilities: ['Duty 1', 'Duty 2'],
        architectureRole: 'Core Component'
      },
      providerUsed: 'gemini'
    })

    const env: WorkerEnv = {
      KV: mockKv,
      verifyProUser: vi.fn().mockResolvedValue({ isPro: true, userId: 'user-pro-123' }),
      explainFile: mockExplain
    }

    const req = new Request('https://api.test/v1/file/explain', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-pro-jwt'
      },
      body: JSON.stringify({
        owner: 'facebook',
        repo: 'react',
        path: 'src/React.js',
        fileSnippet: 'export function React() {}'
      })
    })

    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      explanation: { summary: string }
      remainingToday: number
      isPro: boolean
    }

    expect(body.isPro).toBe(true)
    expect(body.explanation.summary).toBe('AI analysis for Pro user')
    // Out of 250 limit, 1 used -> 249 remaining
    expect(body.remainingToday).toBe(249)

    // Check that KV quota was incremented
    const today = new Date().toISOString().slice(0, 10)
    expect(mockKv.store.get(`quota:${today}:pro:user-pro-123`)).toBe('1')
  })

  it('deducts from Free quota and returns remaining count', async () => {
    const mockExplain = vi.fn().mockResolvedValue({
      explanation: {
        summary: 'Free analysis',
        keyResponsibilities: ['Duty 1'],
        architectureRole: 'Utility'
      },
      providerUsed: 'cfAi'
    })

    const env: WorkerEnv = {
      KV: mockKv,
      verifyProUser: vi.fn().mockResolvedValue({ isPro: false, userId: 'free-user-456' }),
      explainFile: mockExplain
    }

    const req = new Request('https://api.test/v1/file/explain', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer free-jwt'
      },
      body: JSON.stringify({
        owner: 'facebook',
        repo: 'react',
        path: 'packages/shared/utils.js',
        fileSnippet: 'export const util = () => {}'
      })
    })

    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { remainingToday: number; isPro: boolean }
    expect(body.isPro).toBe(false)
    // 15 limit - 1 = 14 remaining
    expect(body.remainingToday).toBe(14)
  })

  it('returns 429 when Pro quota is exceeded', async () => {
    const today = new Date().toISOString().slice(0, 10)
    // Pre-exhaust quota: 250 out of 250 used
    mockKv.store.set(`quota:${today}:pro:exhausted-user`, '250')

    const env: WorkerEnv = {
      KV: mockKv,
      verifyProUser: vi.fn().mockResolvedValue({ isPro: true, userId: 'exhausted-user' })
    }

    const req = new Request('https://api.test/v1/file/explain', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer exhausted-token'
      },
      body: JSON.stringify({
        owner: 'facebook',
        repo: 'react',
        path: 'packages/react/index.js'
      })
    })

    const res = await worker.fetch(req, env)
    expect(res.status).toBe(429)
    const body = (await res.json()) as { error: string; code: string }
    expect(body.error).toBe('QUOTA_EXCEEDED')
    expect(body.code).toBe('PRO_QUOTA_EXHAUSTED')
  })
})
