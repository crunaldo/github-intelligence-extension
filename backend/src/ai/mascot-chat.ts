import { checkAndIncrementQuota } from '../middleware/rate-limiter'
import { createTimeoutSignal } from './providers/shared'
import {
  AIProvidersExhaustedError,
  type AnalysisResult,
  type KVNamespace,
  type ProviderFailure,
  type ProviderName
} from './types'

const MAX_CHAT_MESSAGES = 20
const MAX_MESSAGE_CHARS = 4000
const MAX_CHAT_OUTPUT_TOKENS = 1024

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_CHAT_MODEL = 'llama-3.3-70b-versatile'

const GEMINI_STREAM_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse'

const CF_AI_CHAT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_CHAT_MODEL = 'deepseek/deepseek-chat'

export const DEFAULT_MASCOT_PRIORITY_ORDER: readonly ProviderName[] = [
  'groq',
  'gemini',
  'cfAi',
  'openRouter'
]

export const DEFAULT_MASCOT_SYSTEM_PROMPT = [
  'You are Octo, the intelligent GitHub repository assistant mascot.',
  'Answer questions concisely and accurately about the active GitHub repository.',
  'Reference concrete files, architecture patterns, and stack details from the repository context when available.'
].join(' ')

export interface MascotChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface MascotRepoContext {
  owner: string
  repo: string
  commitSha?: string
  summary?: AnalysisResult['summary'] | Record<string, unknown>
}

export interface MascotChatRequest {
  userId: string
  messages: MascotChatMessage[]
  repoContext: MascotRepoContext
}

export interface MascotChatPrompt {
  system: string
  messages: MascotChatMessage[]
}

export type MascotChatProviderFn = (
  prompt: MascotChatPrompt,
  options: MascotChatOptions
) => Promise<AsyncIterable<string> | string>

export interface MascotChatOptions {
  proLimit?: number
  systemPrompt?: string
  priorityOrder?: ProviderName[]
  chatProviders?: Partial<Record<ProviderName, MascotChatProviderFn>>
  geminiApiKey?: string
  groqApiKey?: string
  cfAiBinding?: { run: (model: string, input: unknown) => Promise<unknown> }
  openRouterApiKey?: string
  timeoutMs?: number
}

export class InvalidMascotRequestError extends Error {
  readonly code = 'INVALID_REQUEST'

  constructor(message: string) {
    super(message)
    this.name = 'InvalidMascotRequestError'
  }
}

function validateAndNormalizeRequest(req: MascotChatRequest): {
  userId: string
  messages: MascotChatMessage[]
  repoContext: MascotRepoContext
} {
  if (!req || typeof req !== 'object') {
    throw new InvalidMascotRequestError('Mascot chat request payload is required')
  }

  const userId = typeof req.userId === 'string' ? req.userId.trim() : ''
  if (!userId) {
    throw new InvalidMascotRequestError('Valid userId is required')
  }

  const owner = typeof req.repoContext?.owner === 'string' ? req.repoContext.owner.trim() : ''
  const repo = typeof req.repoContext?.repo === 'string' ? req.repoContext.repo.trim() : ''
  if (!owner || !repo) {
    throw new InvalidMascotRequestError('Valid repoContext.owner and repoContext.repo are required')
  }

  if (!Array.isArray(req.messages) || req.messages.length === 0) {
    throw new InvalidMascotRequestError('At least one chat message is required')
  }

  const normalizedMessages: MascotChatMessage[] = []
  for (const item of req.messages) {
    if (!item || (item.role !== 'user' && item.role !== 'assistant')) {
      throw new InvalidMascotRequestError('Each message must have role "user" or "assistant"')
    }
    if (typeof item.content !== 'string') {
      throw new InvalidMascotRequestError('Each message content must be a string')
    }
    const trimmed = item.content.trim()
    if (!trimmed) {
      throw new InvalidMascotRequestError('Message content cannot be empty')
    }
    normalizedMessages.push({
      role: item.role,
      content: trimmed.slice(0, MAX_MESSAGE_CHARS)
    })
  }

  const cappedMessages = normalizedMessages.slice(-MAX_CHAT_MESSAGES)
  if (cappedMessages.length === 0) {
    throw new InvalidMascotRequestError('At least one non-empty message is required')
  }

  return {
    userId,
    messages: cappedMessages,
    repoContext: {
      owner,
      repo,
      ...(typeof req.repoContext.commitSha === 'string' && req.repoContext.commitSha.trim()
        ? { commitSha: req.repoContext.commitSha.trim() }
        : {}),
      ...(req.repoContext.summary ? { summary: req.repoContext.summary } : {})
    }
  }
}

function buildMascotPrompt(
  repoContext: MascotRepoContext,
  messages: MascotChatMessage[],
  customSystemPrompt?: string
): MascotChatPrompt {
  const basePrompt = customSystemPrompt?.trim() || DEFAULT_MASCOT_SYSTEM_PROMPT
  const contextLines = [
    basePrompt,
    '',
    `Active Repository: ${repoContext.owner}/${repoContext.repo}`
  ]

  if (repoContext.commitSha) {
    contextLines.push(`Commit/Ref: ${repoContext.commitSha}`)
  }

  if (repoContext.summary) {
    try {
      contextLines.push(`Cached Repository Summary: ${JSON.stringify(repoContext.summary)}`)
    } catch {
      // Ignore unserializable summary
    }
  }

  return {
    system: contextLines.join('\n'),
    messages
  }
}

async function* parseSseByteStream(
  body: ReadableStream<Uint8Array>,
  extractDelta: (dataPayload: string) => string | null
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) {
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (!payload || payload === '[DONE]') continue
          const delta = extractDelta(payload)
          if (delta) yield delta
        }
      }
    }

    buffer += decoder.decode()
    for (const line of buffer.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      const delta = extractDelta(payload)
      if (delta) yield delta
    }
  } finally {
    reader.releaseLock()
  }
}

function extractOpenAIDelta(payload: string): string | null {
  try {
    const parsed = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string | null }; message?: { content?: string | null } }>
    }
    const content =
      parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content ?? null
    return typeof content === 'string' && content.length > 0 ? content : null
  } catch {
    return null
  }
}

function extractGeminiDelta(payload: string): string | null {
  try {
    const parsed = JSON.parse(payload) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const parts = parsed.candidates?.[0]?.content?.parts
    if (!Array.isArray(parts)) return null
    const text = parts.map((p) => p.text ?? '').join('')
    return text.length > 0 ? text : null
  } catch {
    return null
  }
}

function extractCloudflareDelta(payload: string): string | null {
  try {
    const parsed = JSON.parse(payload) as { response?: unknown }
    return typeof parsed.response === 'string' && parsed.response.length > 0
      ? parsed.response
      : null
  } catch {
    return null
  }
}

async function callOpenAICompatibleStream(options: {
  provider: ProviderName
  endpoint: string
  apiKey: string | undefined
  model: string
  prompt: MascotChatPrompt
  timeoutMs?: number
  extraHeaders?: Record<string, string>
}): Promise<AsyncIterable<string>> {
  if (!options.apiKey) {
    throw new Error(`${options.provider} API key is not configured`)
  }

  const response = await fetch(options.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey}`,
      ...options.extraHeaders
    },
    signal: createTimeoutSignal(options.timeoutMs),
    body: JSON.stringify({
      model: options.model,
      messages: [
        { role: 'system', content: options.prompt.system },
        ...options.prompt.messages
      ],
      stream: true,
      max_tokens: MAX_CHAT_OUTPUT_TOKENS,
      temperature: 0.3
    })
  })

  if (!response.ok) {
    throw new Error(`${options.provider} HTTP ${response.status}`)
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>
    }
    const content = json.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.length) {
      throw new Error(`${options.provider} response missing message content`)
    }
    return (async function* () {
      yield content
    })()
  }

  if (!response.body) {
    throw new Error(`${options.provider} response missing stream body`)
  }

  return parseSseByteStream(response.body, extractOpenAIDelta)
}

async function streamWithGroq(
  prompt: MascotChatPrompt,
  options: MascotChatOptions
): Promise<AsyncIterable<string>> {
  return callOpenAICompatibleStream({
    provider: 'groq',
    endpoint: GROQ_ENDPOINT,
    apiKey: options.groqApiKey,
    model: GROQ_CHAT_MODEL,
    prompt,
    timeoutMs: options.timeoutMs
  })
}

async function streamWithOpenRouter(
  prompt: MascotChatPrompt,
  options: MascotChatOptions
): Promise<AsyncIterable<string>> {
  return callOpenAICompatibleStream({
    provider: 'openRouter',
    endpoint: OPENROUTER_ENDPOINT,
    apiKey: options.openRouterApiKey,
    model: OPENROUTER_CHAT_MODEL,
    prompt,
    timeoutMs: options.timeoutMs,
    extraHeaders: {
      'X-Title': 'GitHub Intelligence Extension'
    }
  })
}

async function streamWithGemini(
  prompt: MascotChatPrompt,
  options: MascotChatOptions
): Promise<AsyncIterable<string>> {
  if (!options.geminiApiKey) {
    throw new Error('gemini API key is not configured')
  }

  const response = await fetch(GEMINI_STREAM_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': options.geminiApiKey
    },
    signal: createTimeoutSignal(options.timeoutMs),
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: prompt.system }]
      },
      contents: prompt.messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      })),
      generationConfig: {
        maxOutputTokens: MAX_CHAT_OUTPUT_TOKENS,
        temperature: 0.3
      }
    })
  })

  if (!response.ok) {
    throw new Error(`gemini HTTP ${response.status}`)
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    if (!text) {
      throw new Error('gemini response missing candidate text')
    }
    return (async function* () {
      yield text
    })()
  }

  if (!response.body) {
    throw new Error('gemini response missing stream body')
  }

  return parseSseByteStream(response.body, extractGeminiDelta)
}

async function streamWithCloudflareAi(
  prompt: MascotChatPrompt,
  options: MascotChatOptions
): Promise<AsyncIterable<string>> {
  if (!options.cfAiBinding) {
    throw new Error('cfAi binding is not configured')
  }

  const rawResult = await options.cfAiBinding.run(CF_AI_CHAT_MODEL, {
    messages: [{ role: 'system', content: prompt.system }, ...prompt.messages],
    max_tokens: MAX_CHAT_OUTPUT_TOKENS,
    stream: true
  })

  if (rawResult instanceof ReadableStream) {
    return parseSseByteStream(rawResult as ReadableStream<Uint8Array>, extractCloudflareDelta)
  }

  if (typeof rawResult === 'string' && rawResult.length > 0) {
    return (async function* () {
      yield rawResult
    })()
  }

  if (rawResult && typeof rawResult === 'object') {
    const respText = (rawResult as { response?: unknown }).response
    if (typeof respText === 'string' && respText.length > 0) {
      return (async function* () {
        yield respText
      })()
    }
  }

  throw new Error('cfAi binding returned an unexpected response')
}

const DEFAULT_CHAT_PROVIDERS: Record<ProviderName, MascotChatProviderFn> = {
  groq: streamWithGroq,
  gemini: streamWithGemini,
  cfAi: streamWithCloudflareAi,
  openRouter: streamWithOpenRouter
}

function toAsyncIterator(source: AsyncIterable<string> | string): AsyncIterator<string> {
  if (typeof source === 'string') {
    const iter = (async function* () {
      if (source.length > 0) yield source
    })()
    return iter[Symbol.asyncIterator]()
  }
  return source[Symbol.asyncIterator]()
}

async function pullFirstNonEmptyDelta(
  iterator: AsyncIterator<string>
): Promise<{ firstDelta: string; iterator: AsyncIterator<string> }> {
  while (true) {
    const next = await iterator.next()
    if (next.done) {
      throw new Error('provider returned empty stream')
    }
    if (typeof next.value === 'string' && next.value.length > 0) {
      return { firstDelta: next.value, iterator }
    }
  }
}

function createSseReadableStream(
  firstDelta: string,
  iterator: AsyncIterator<string>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const encodeDelta = (delta: string) =>
    encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`)

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encodeDelta(firstDelta))

        while (true) {
          const next = await iterator.next()
          if (next.done) break
          if (typeof next.value === 'string' && next.value.length > 0) {
            controller.enqueue(encodeDelta(next.value))
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
    async cancel() {
      if (typeof iterator.return === 'function') {
        try {
          await iterator.return()
        } catch {
          // Ignore iterator cleanup errors
        }
      }
    }
  })
}

/**
 * Enforces the unified 250/day Pro quota in KV and initiates a multi-provider
 * SSE stream (`data: {"delta":"..."}\n\n` + `data: [DONE]\n\n`) for mascot chat.
 */
export async function handleMascotChatRequest(
  req: MascotChatRequest,
  kv: KVNamespace,
  options: MascotChatOptions = {}
): Promise<ReadableStream<Uint8Array>> {
  const normalized = validateAndNormalizeRequest(req)

  const quotaId = normalized.userId.startsWith('pro:')
    ? normalized.userId
    : `pro:${normalized.userId}`
  const quota = await checkAndIncrementQuota(
    quotaId,
    true,
    kv,
    options.proLimit ? { proLimit: options.proLimit } : undefined
  )
  if (!quota.allowed) {
    throw new Error('PRO_QUOTA_EXHAUSTED')
  }

  const prompt = buildMascotPrompt(
    normalized.repoContext,
    normalized.messages,
    options.systemPrompt
  )

  const configuredOrder =
    options.priorityOrder && options.priorityOrder.length > 0
      ? options.priorityOrder
      : DEFAULT_MASCOT_PRIORITY_ORDER
  const order = Array.from(new Set(configuredOrder))

  const failures: ProviderFailure[] = []

  for (const providerName of order) {
    const providerFn =
      options.chatProviders?.[providerName] ?? DEFAULT_CHAT_PROVIDERS[providerName]
    if (!providerFn) {
      failures.push({ provider: providerName, message: `Unknown provider "${providerName}"` })
      continue
    }

    try {
      const output = await providerFn(prompt, options)
      const iterator = toAsyncIterator(output)
      const { firstDelta } = await pullFirstNonEmptyDelta(iterator)
      return createSseReadableStream(firstDelta, iterator)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push({ provider: providerName, message })
    }
  }

  throw new AIProvidersExhaustedError(failures)
}
