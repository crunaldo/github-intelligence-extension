import { describe, it, expect, vi, afterEach } from 'vitest'
import { generateRepoAnalysis } from '../src/ai/router'
import { buildRepoPrompt } from '../src/ai/providers/shared'
import { DEFAULT_SYSTEM_PROMPT_REPO } from '../../admin/src/lib/admin-types'
import type { AnalysisResult, RepoContext } from '../src/ai/types'

const mockContext: RepoContext = {
  owner: 'test-owner',
  repo: 'test-repo',
  commitSha: 'abc1234',
  readme: '# Test Repo\nA test library.',
  manifests: { 'package.json': '{"name":"test"}' }
}

const samplePayload = {
  summary: {
    headline: 'A test project',
    whatItIs: 'Test library',
    whyItMatters: 'Helpful for testing',
    practicalUse: 'Unit tests',
    targetAudience: 'Developers',
    stackPills: ['TypeScript']
  },
  architectureDiagram: 'graph TD; A-->B;',
  deepAudit: { strengths: ['Fast'], concerns: [] }
}

function makeResult(providerUsed: string, tokensConsumed = 120): AnalysisResult {
  return {
    ...samplePayload,
    providerUsed,
    tokensConsumed
  }
}

describe('AI Multi-Provider Fallback Router', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('falls back to Groq when Gemini returns 429 rate limit', async () => {
    const mockProviders = {
      gemini: vi.fn().mockRejectedValue(new Error('429 Too Many Requests')),
      groq: vi.fn().mockResolvedValue(makeResult('groq', 120)),
      cfAi: vi.fn(),
      openRouter: vi.fn()
    }

    const result = await generateRepoAnalysis(mockContext, { providers: mockProviders })

    expect(mockProviders.gemini).toHaveBeenCalledOnce()
    expect(mockProviders.groq).toHaveBeenCalledOnce()
    expect(mockProviders.cfAi).not.toHaveBeenCalled()
    expect(mockProviders.openRouter).not.toHaveBeenCalled()
    expect(result.providerUsed).toBe('groq')
    expect(result.summary.whatItIs).toBe('Test library')
  })

  it('respects custom priorityOrder when routing providers', async () => {
    const callOrder: string[] = []
    const mockProviders = {
      gemini: vi.fn(async () => {
        callOrder.push('gemini')
        return makeResult('gemini')
      }),
      groq: vi.fn(async () => {
        callOrder.push('groq')
        return makeResult('groq')
      }),
      cfAi: vi.fn(async () => {
        callOrder.push('cfAi')
        return makeResult('cfAi')
      }),
      openRouter: vi.fn(async () => {
        callOrder.push('openRouter')
        throw new Error('503 Service Unavailable')
      })
    }

    const result = await generateRepoAnalysis(mockContext, {
      providers: mockProviders,
      priorityOrder: ['openRouter', 'cfAi', 'groq', 'gemini']
    })

    expect(callOrder).toEqual(['openRouter', 'cfAi'])
    expect(result.providerUsed).toBe('cfAi')
    expect(mockProviders.groq).not.toHaveBeenCalled()
    expect(mockProviders.gemini).not.toHaveBeenCalled()
  })

  it('rejects with AI_PROVIDERS_EXHAUSTED when all providers fail', async () => {
    const mockProviders = {
      gemini: vi.fn().mockRejectedValue(new Error('Gemini 429')),
      groq: vi.fn().mockRejectedValue(new Error('Groq 500')),
      cfAi: vi.fn().mockRejectedValue(new Error('CF AI timeout')),
      openRouter: vi.fn().mockRejectedValue(new Error('OpenRouter 502'))
    }

    let caughtError: unknown
    try {
      await generateRepoAnalysis(mockContext, { providers: mockProviders })
    } catch (error) {
      caughtError = error
    }

    expect(caughtError).toBeInstanceOf(Error)
    expect((caughtError as Error).message).toContain('AI_PROVIDERS_EXHAUSTED')
    expect((caughtError as { code?: string }).code).toBe('AI_PROVIDERS_EXHAUSTED')

    expect(mockProviders.gemini).toHaveBeenCalledOnce()
    expect(mockProviders.groq).toHaveBeenCalledOnce()
    expect(mockProviders.cfAi).toHaveBeenCalledOnce()
    expect(mockProviders.openRouter).toHaveBeenCalledOnce()
  })

  it('parses markdown-fenced JSON from Gemini provider wrapper', async () => {
    const fencedJson = '```json\n' + JSON.stringify(samplePayload) + '\n```'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: fencedJson }] } }],
          usageMetadata: { totalTokenCount: 345 }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateRepoAnalysis(mockContext, {
      geminiApiKey: 'test-gemini-key',
      priorityOrder: ['gemini']
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [geminiUrl, geminiInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(geminiUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
    )
    expect(geminiInit.method).toBe('POST')
    expect(geminiInit.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-goog-api-key': 'test-gemini-key'
    })
    expect(geminiInit.signal).toBeInstanceOf(AbortSignal)
    const geminiBody = JSON.parse(String(geminiInit.body))
    expect(geminiBody.generationConfig).toEqual({
      responseMimeType: 'application/json',
      maxOutputTokens: 2048,
      temperature: 0.2
    })

    expect(result.providerUsed).toBe('gemini')
    expect(result.tokensConsumed).toBe(345)
    expect(result.summary.headline).toBe('A test project')
    expect(result.architectureDiagram).toBe('graph TD; A-->B;')
  })

  it('falls back from Gemini HTTP 429 to Groq fetch wrapper and parses JSON', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(samplePayload) } }],
            usage: { total_tokens: 210 }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateRepoAnalysis(mockContext, {
      geminiApiKey: 'test-gemini-key',
      groqApiKey: 'test-groq-key',
      priorityOrder: ['gemini', 'groq']
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
    )
    const [groqUrl, groqInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(groqUrl).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect(groqInit.method).toBe('POST')
    expect(groqInit.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-groq-key'
    })
    expect(groqInit.signal).toBeInstanceOf(AbortSignal)
    const groqBody = JSON.parse(String(groqInit.body))
    expect(groqBody).toMatchObject({
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      max_tokens: 2048,
      temperature: 0.2
    })

    expect(result.providerUsed).toBe('groq')
    expect(result.tokensConsumed).toBe(210)
    expect(result.deepAudit.strengths).toEqual(['Fast'])
  })

  it('supports Cloudflare Workers AI binding and OpenRouter fallback on invalid JSON', async () => {
    const cfAiBinding = {
      run: vi.fn().mockResolvedValue({
        response: JSON.stringify({ summary: { headline: 'incomplete' } })
      })
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '```\n' + JSON.stringify(samplePayload) + '\n```'
              }
            }
          ],
          usage: { total_tokens: 512 }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateRepoAnalysis(mockContext, {
      cfAiBinding,
      openRouterApiKey: 'test-or-key',
      priorityOrder: ['cfAi', 'openRouter']
    })

    expect(cfAiBinding.run).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledOnce()
    const [orUrl, orInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(orUrl).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(orInit.method).toBe('POST')
    expect(orInit.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-or-key',
      'X-Title': 'GitHub Intelligence Extension'
    })
    expect(orInit.signal).toBeInstanceOf(AbortSignal)
    const orBody = JSON.parse(String(orInit.body))
    expect(orBody).toMatchObject({
      model: 'deepseek/deepseek-chat',
      response_format: { type: 'json_object' },
      max_tokens: 2048,
      temperature: 0.2
    })

    expect(result.providerUsed).toBe('openRouter')
    expect(result.tokensConsumed).toBe(512)
  })

  it('parses valid JSON from Cloudflare Workers AI binding and forwards custom systemPrompt', async () => {
    const cfAiBinding = {
      run: vi.fn().mockResolvedValue({
        response: JSON.stringify(samplePayload),
        usage: { total_tokens: 99 }
      })
    }

    const result = await generateRepoAnalysis(mockContext, {
      cfAiBinding,
      priorityOrder: ['cfAi'],
      systemPrompt: 'Custom architecture prompt'
    })

    expect(cfAiBinding.run).toHaveBeenCalledOnce()
    const callArgs = cfAiBinding.run.mock.calls[0]
    expect(callArgs[0]).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast')
    expect(callArgs[1]).toMatchObject({
      messages: [
        { role: 'system', content: expect.stringContaining('Custom architecture prompt') },
        { role: 'user', content: expect.stringContaining('test-owner/test-repo') }
      ],
      max_tokens: 2048
    })
    const systemSent = String((callArgs[1] as { messages: Array<{ content: string }> }).messages[0].content)
    expect(systemSent).toContain('"architectureDiagram"')
    expect(systemSent).toContain('"deepAudit"')
    expect(result.providerUsed).toBe('cfAi')
    expect(result.tokensConsumed).toBe(99)
    expect(result.summary.stackPills).toEqual(['TypeScript'])
  })

  it('applies custom timeoutMs via AbortSignal.timeout on outgoing fetch requests', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(samplePayload) } }],
          usage: { total_tokens: 77 }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await generateRepoAnalysis(mockContext, {
      groqApiKey: 'test-groq-key',
      priorityOrder: ['groq'],
      timeoutMs: 4200
    })

    expect(timeoutSpy).toHaveBeenCalledWith(4200)
  })

  it('buildRepoPrompt retains required JSON schema instructions when a custom systemPrompt is passed', () => {
    const custom = buildRepoPrompt(mockContext, 'Write explanations in Spanish for beginners.')
    expect(custom.system).toContain('Write explanations in Spanish for beginners.')
    expect(custom.system).toContain('"summary"')
    expect(custom.system).toContain('"headline"')
    expect(custom.system).toContain('"whatItIs"')
    expect(custom.system).toContain('"whyItMatters"')
    expect(custom.system).toContain('"practicalUse"')
    expect(custom.system).toContain('"targetAudience"')
    expect(custom.system).toContain('"stackPills"')
    expect(custom.system).toContain('"architectureDiagram"')
    expect(custom.system).toContain('"deepAudit"')
    expect(custom.system).toContain('"strengths"')
    expect(custom.system).toContain('"concerns"')

    const adminDefault = buildRepoPrompt(mockContext, DEFAULT_SYSTEM_PROMPT_REPO)
    expect(adminDefault.system).toContain(DEFAULT_SYSTEM_PROMPT_REPO)
    expect(adminDefault.system).toContain('"architectureDiagram"')
    expect(adminDefault.system).toContain('"deepAudit"')
  })
})
