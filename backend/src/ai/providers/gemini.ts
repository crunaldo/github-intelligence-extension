import type { AIConfig, AnalysisResult, RepoContext } from '../types'
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  buildRepoPrompt,
  createTimeoutSignal,
  parseAnalysisResponse
} from './shared'

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
  usageMetadata?: {
    totalTokenCount?: number
  }
}

/** Analyzes a repository using Google Gemini 2.0 Flash REST API. */
export async function analyzeWithGemini(
  context: RepoContext,
  config: AIConfig
): Promise<AnalysisResult> {
  if (!config.geminiApiKey) {
    throw new Error('gemini API key is not configured')
  }

  const { system, user } = buildRepoPrompt(context, config.systemPrompt)
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

  const data = (await response.json()) as GeminiResponse
  const parts = data.candidates?.[0]?.content?.parts
  const text = parts?.map((part) => part.text ?? '').join('') ?? ''
  if (!text) {
    throw new Error('gemini response missing candidate text')
  }

  return parseAnalysisResponse(text, 'gemini', data.usageMetadata?.totalTokenCount ?? 0)
}
