import type { AnalysisResult, ProviderName, RepoContext } from '../types'

const MAX_README_CHARS = 16000
const MAX_MANIFEST_CHARS = 8000
export const DEFAULT_MAX_OUTPUT_TOKENS = 2048
export const DEFAULT_TIMEOUT_MS = 15000

/** Creates an AbortSignal that times out after the configured milliseconds. */
export function createTimeoutSignal(timeoutMs?: number): AbortSignal {
  const effectiveTimeout =
    typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_TIMEOUT_MS
  return AbortSignal.timeout(effectiveTimeout)
}

export const DEFAULT_SYSTEM_PROMPT = [
  'You are an expert software architect analyzing a public GitHub repository.',
  'Return strictly valid JSON with no surrounding markdown or commentary matching this exact structure:',
  '{',
  '  "summary": {',
  '    "headline": "string",',
  '    "whatItIs": "string",',
  '    "whyItMatters": "string",',
  '    "practicalUse": "string",',
  '    "targetAudience": "string",',
  '    "stackPills": ["string"]',
  '  },',
  '  "architectureDiagram": "Mermaid flowchart/graph syntax string",',
  '  "deepAudit": {',
  '    "strengths": ["string"],',
  '    "concerns": ["string"]',
  '  }',
  '}'
].join('\n')

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function stripMarkdownFences(raw: string): string {
  const trimmed = raw.trim()
  const fenceMatch = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/i.exec(trimmed)
  return fenceMatch?.[1] !== undefined ? fenceMatch[1].trim() : trimmed
}

/** Builds system and user prompts from repository context. */
export function buildRepoPrompt(
  context: RepoContext,
  customSystemPrompt?: string
): { system: string; user: string } {
  const system = customSystemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT
  const manifestEntries = Object.entries(context.manifests)
    .map(([filename, content]) => `--- ${filename} ---\n${content}`)
    .join('\n\n')
    .slice(0, MAX_MANIFEST_CHARS)
  const readmeSnippet = context.readme.slice(0, MAX_README_CHARS)

  const user = [
    `Repository: ${context.owner}/${context.repo}`,
    `Commit SHA: ${context.commitSha}`,
    '',
    'README:',
    readmeSnippet || '(No README provided)',
    '',
    'Manifests:',
    manifestEntries || '(No manifests provided)'
  ].join('\n')

  return { system, user }
}

/** Parses and validates structured AI output into an AnalysisResult. */
export function parseAnalysisResponse(
  raw: unknown,
  providerUsed: ProviderName,
  tokensConsumed = 0
): AnalysisResult {
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    const cleaned = stripMarkdownFences(raw)
    if (!cleaned) {
      throw new Error(`${providerUsed} returned an empty response`)
    }
    try {
      parsed = JSON.parse(cleaned)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`${providerUsed} returned invalid JSON: ${detail}`)
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`${providerUsed} response must be a JSON object`)
  }

  const record = parsed as Record<string, unknown>
  const summary = record.summary as Record<string, unknown> | undefined
  const deepAudit = record.deepAudit as Record<string, unknown> | undefined

  if (
    !summary ||
    typeof summary !== 'object' ||
    !isNonEmptyString(summary.headline) ||
    !isNonEmptyString(summary.whatItIs) ||
    !isNonEmptyString(summary.whyItMatters) ||
    !isNonEmptyString(summary.practicalUse) ||
    !isNonEmptyString(summary.targetAudience) ||
    !isStringArray(summary.stackPills)
  ) {
    throw new Error(`${providerUsed} response missing required summary fields`)
  }

  if (!isNonEmptyString(record.architectureDiagram)) {
    throw new Error(`${providerUsed} response missing required architectureDiagram field`)
  }

  if (
    !deepAudit ||
    typeof deepAudit !== 'object' ||
    !isStringArray(deepAudit.strengths) ||
    !isStringArray(deepAudit.concerns)
  ) {
    throw new Error(`${providerUsed} response missing required deepAudit fields`)
  }

  const normalizedTokens =
    typeof tokensConsumed === 'number' && Number.isFinite(tokensConsumed) && tokensConsumed >= 0
      ? tokensConsumed
      : 0

  return {
    summary: {
      headline: summary.headline,
      whatItIs: summary.whatItIs,
      whyItMatters: summary.whyItMatters,
      practicalUse: summary.practicalUse,
      targetAudience: summary.targetAudience,
      stackPills: summary.stackPills
    },
    architectureDiagram: record.architectureDiagram,
    deepAudit: {
      strengths: deepAudit.strengths,
      concerns: deepAudit.concerns
    },
    providerUsed,
    tokensConsumed: normalizedTokens
  }
}

export interface OpenAICompatibleOptions {
  provider: ProviderName
  endpoint: string
  apiKey: string | undefined
  model: string
  context: RepoContext
  systemPrompt?: string
  timeoutMs?: number
  extraHeaders?: Record<string, string>
}

interface OpenAICompatibleResponse {
  choices?: Array<{
    message?: {
      content?: string | null
    }
  }>
  usage?: {
    total_tokens?: number
  }
}

/** Shared client for OpenAI-compatible chat completion APIs (Groq, OpenRouter). */
export async function callOpenAICompatibleProvider(
  options: OpenAICompatibleOptions
): Promise<AnalysisResult> {
  if (!options.apiKey) {
    throw new Error(`${options.provider} API key is not configured`)
  }

  const { system, user } = buildRepoPrompt(options.context, options.systemPrompt)
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
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      response_format: { type: 'json_object' },
      max_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
      temperature: 0.2
    })
  })

  if (!response.ok) {
    throw new Error(`${options.provider} HTTP ${response.status}`)
  }

  const data = (await response.json()) as OpenAICompatibleResponse
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error(`${options.provider} response missing choices[0].message.content`)
  }

  return parseAnalysisResponse(content, options.provider, data.usage?.total_tokens ?? 0)
}
