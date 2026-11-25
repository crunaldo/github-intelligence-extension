import {
  AIProvidersExhaustedError,
  type AIConfig,
  type ApiKeyItem,
  type ProviderFailure,
  type ProviderName
} from './types'
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  createTimeoutSignal
} from './providers/shared'

export interface FileExplainerContext {
  owner: string
  repo: string
  path: string
  ref?: string
  fileContent: string
  repoSummary?: string
  locale?: string
}

export interface FileExplanationData {
  summary: string
  keyResponsibilities: string[]
  architectureRole: string
}

export interface FileExplainerResult {
  explanation: FileExplanationData
  providerUsed: ProviderName
  tokensConsumed?: number
}

export type FileExplainerProviderFn = (
  context: FileExplainerContext,
  config: AIConfig
) => Promise<FileExplainerResult>

const MAX_FILE_CHARS = 8000
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'
const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
const CF_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_MODEL = 'deepseek/deepseek-chat'

export const DEFAULT_FILE_EXPLAINER_PRIORITY: readonly ProviderName[] = [
  'gemini',
  'groq',
  'cfAi',
  'openRouter'
]

function stripMarkdownFences(raw: string): string {
  const trimmed = raw.trim()
  const fenceMatch = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/i.exec(trimmed)
  return fenceMatch?.[1] !== undefined ? fenceMatch[1].trim() : trimmed
}

export function parseFileExplanationJson(
  raw: unknown,
  providerUsed: ProviderName,
  tokensConsumed = 0
): FileExplainerResult {
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    const cleaned = stripMarkdownFences(raw)
    if (!cleaned) {
      throw new Error(`${providerUsed} returned an empty response`)
    }
    try {
      parsed = JSON.parse(cleaned)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`${providerUsed} returned invalid JSON: ${msg}`)
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${providerUsed} response must be a JSON object`)
  }

  const record = parsed as Record<string, unknown>
  const summary =
    typeof record.summary === 'string' && record.summary.trim().length > 0
      ? record.summary.trim()
      : ''
  const architectureRole =
    typeof record.architectureRole === 'string' && record.architectureRole.trim().length > 0
      ? record.architectureRole.trim()
      : typeof record.role === 'string' && record.role.trim().length > 0
        ? record.role.trim()
        : ''

  const rawResponsibilities = Array.isArray(record.keyResponsibilities)
    ? record.keyResponsibilities
    : Array.isArray(record.responsibilities)
      ? record.responsibilities
      : []

  const keyResponsibilities = rawResponsibilities.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0
  )

  if (!summary || !architectureRole || keyResponsibilities.length === 0) {
    throw new Error(`${providerUsed} response missing required file explanation fields`)
  }

  return {
    explanation: {
      summary,
      keyResponsibilities,
      architectureRole
    },
    providerUsed,
    tokensConsumed
  }
}

export function buildFileExplainerPrompt(context: FileExplainerContext): {
  system: string
  user: string
} {
  const isEn = context.locale === 'en'
  const langDirective = isEn
    ? 'IMPORTANT: All output text (summary, keyResponsibilities, architectureRole) MUST be written in English.'
    : 'IMPORTANTE: Todo el texto generado (summary, keyResponsibilities, architectureRole) DEBE estar escrito en español.'

  const system = [
    'You are an expert software architect analyzing an individual source file within a GitHub repository.',
    'Analyze the given file path, code content snippet, and repository context.',
    'You must respond strictly with a valid JSON object matching this schema:',
    '{',
    '  "summary": "1-2 clear sentences explaining the specific purpose and functionality of this file.",',
    '  "keyResponsibilities": ["Bullet point 1 detailing a core function/duty", "Bullet point 2", "Bullet point 3"],',
    '  "architectureRole": "Short designation of its role in the system (e.g. Data Access Layer, State Management, UI Component, API Routing, Utility, Middleware, etc.)"',
    '}',
    langDirective
  ].join('\n')

  const snippet = (context.fileContent || '').slice(0, MAX_FILE_CHARS)
  const user = [
    `Repository: ${context.owner}/${context.repo}`,
    `File Path: ${context.path}`,
    context.ref ? `Reference/Commit: ${context.ref}` : '',
    context.repoSummary ? `Repository Context: ${context.repoSummary}` : '',
    '',
    'File Content:',
    snippet || '(Empty or binary file - analyze purpose based on file path and conventions)'
  ]
    .filter(Boolean)
    .join('\n')

  return { system, user }
}

async function explainWithGemini(
  context: FileExplainerContext,
  config: AIConfig
): Promise<FileExplainerResult> {
  if (!config.geminiApiKey) {
    throw new Error('gemini API key is not configured')
  }

  const { system, user } = buildFileExplainerPrompt(context)
  const response = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.geminiApiKey
    },
    signal: createTimeoutSignal(config.timeoutMs),
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: system }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: user }]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
        temperature: 0.2
      }
    })
  })

  if (!response.ok) {
    throw new Error(`gemini HTTP ${response.status}`)
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    usageMetadata?: { totalTokenCount?: number }
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!text) {
    throw new Error('gemini response missing candidate text')
  }

  return parseFileExplanationJson(text, 'gemini', data.usageMetadata?.totalTokenCount ?? 0)
}

async function explainWithGroq(
  context: FileExplainerContext,
  config: AIConfig
): Promise<FileExplainerResult> {
  if (!config.groqApiKey) {
    throw new Error('groq API key is not configured')
  }

  const { system, user } = buildFileExplainerPrompt(context)
  const response = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.groqApiKey}`
    },
    signal: createTimeoutSignal(config.timeoutMs),
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      response_format: { type: 'json_object' },
      max_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
      temperature: 0.2
    })
  })

  if (!response.ok) {
    throw new Error(`groq HTTP ${response.status}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { total_tokens?: number }
  }
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error('groq response missing choices[0].message.content')
  }

  return parseFileExplanationJson(content, 'groq', data.usage?.total_tokens ?? 0)
}

async function explainWithCloudflareAi(
  context: FileExplainerContext,
  config: AIConfig
): Promise<FileExplainerResult> {
  if (!config.cfAiBinding) {
    throw new Error('cfAi binding is not configured')
  }

  const { system, user } = buildFileExplainerPrompt(context)
  const rawResult = await config.cfAiBinding.run(CF_AI_MODEL, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    max_tokens: DEFAULT_MAX_OUTPUT_TOKENS
  })

  if (typeof rawResult === 'string') {
    return parseFileExplanationJson(rawResult, 'cfAi', 0)
  }

  if (rawResult && typeof rawResult === 'object') {
    const cfResp = rawResult as { response?: unknown; usage?: { total_tokens?: number } }
    const payload = cfResp.response !== undefined ? cfResp.response : rawResult
    const tokens = cfResp.usage?.total_tokens ?? 0
    return parseFileExplanationJson(payload, 'cfAi', tokens)
  }

  throw new Error('cfAi binding returned an unexpected response type')
}

async function explainWithOpenRouter(
  context: FileExplainerContext,
  config: AIConfig
): Promise<FileExplainerResult> {
  if (!config.openRouterApiKey) {
    throw new Error('openRouter API key is not configured')
  }

  const { system, user } = buildFileExplainerPrompt(context)
  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openRouterApiKey}`,
      'X-Title': 'GitHub Intelligence Extension'
    },
    signal: createTimeoutSignal(config.timeoutMs),
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      response_format: { type: 'json_object' },
      max_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
      temperature: 0.2
    })
  })

  if (!response.ok) {
    throw new Error(`openRouter HTTP ${response.status}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { total_tokens?: number }
  }
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error('openRouter response missing choices[0].message.content')
  }

  return parseFileExplanationJson(content, 'openRouter', data.usage?.total_tokens ?? 0)
}

const DEFAULT_FILE_PROVIDERS: Record<ProviderName, FileExplainerProviderFn> = {
  gemini: explainWithGemini,
  groq: explainWithGroq,
  cfAi: explainWithCloudflareAi,
  openRouter: explainWithOpenRouter
}

function resolveProviderSpecificConfig(
  provider: ProviderName,
  apiKey: string,
  baseConfig: AIConfig
): AIConfig {
  switch (provider) {
    case 'gemini':
      return { ...baseConfig, geminiApiKey: apiKey }
    case 'groq':
      return { ...baseConfig, groqApiKey: apiKey }
    case 'openRouter':
      return { ...baseConfig, openRouterApiKey: apiKey }
    case 'cfAi':
    default:
      return baseConfig
  }
}

export async function generateFileExplanation(
  context: FileExplainerContext,
  config: AIConfig & {
    fileProviders?: Partial<Record<ProviderName, FileExplainerProviderFn>>
  } = {}
): Promise<FileExplainerResult> {
  const configuredOrder =
    config.priorityOrder && config.priorityOrder.length > 0
      ? config.priorityOrder
      : DEFAULT_FILE_EXPLAINER_PRIORITY
  const order = Array.from(new Set(configuredOrder))
  const failures: ProviderFailure[] = []

  for (const providerName of order) {
    const providerFn =
      config.fileProviders?.[providerName] ?? DEFAULT_FILE_PROVIDERS[providerName]
    if (!providerFn) {
      failures.push({ provider: providerName, message: `Unknown provider "${providerName}"` })
      continue
    }

    const poolKeys = (config.apiKeysPool ?? []).filter(
      (item): item is ApiKeyItem =>
        item.provider === providerName && item.enabled && Boolean(item.key?.trim())
    )

    if (poolKeys.length > 0) {
      const orderedKeys = [...poolKeys]
      if (config.keyRotationStrategy === 'round_robin' && orderedKeys.length > 1) {
        const offset = Math.floor(Math.random() * orderedKeys.length)
        orderedKeys.push(...orderedKeys.splice(0, offset))
      }

      for (const keyItem of orderedKeys) {
        try {
          const keyConfig = resolveProviderSpecificConfig(providerName, keyItem.key, config)
          return await providerFn(context, keyConfig)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          failures.push({
            provider: providerName,
            message: `Key "${keyItem.label || keyItem.id}": ${message}`
          })
        }
      }
    } else {
      try {
        return await providerFn(context, config)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        failures.push({ provider: providerName, message })
      }
    }
  }

  throw new AIProvidersExhaustedError(failures)
}
