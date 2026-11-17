import type { AIConfig, AnalysisResult, RepoContext } from '../types'
import { buildRepoPrompt, parseAnalysisResponse } from './shared'

const CF_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

interface CloudflareAiResponse {
  response?: unknown
  usage?: {
    total_tokens?: number
  }
}

/** Analyzes a repository using the Cloudflare Workers AI binding. */
export async function analyzeWithCloudflareAi(
  context: RepoContext,
  config: AIConfig
): Promise<AnalysisResult> {
  if (!config.cfAiBinding) {
    throw new Error('cfAi binding is not configured')
  }

  const { system, user } = buildRepoPrompt(context, config.systemPrompt)
  const rawResult = await config.cfAiBinding.run(CF_AI_MODEL, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  })

  if (typeof rawResult === 'string') {
    return parseAnalysisResponse(rawResult, 'cfAi', 0)
  }

  if (rawResult && typeof rawResult === 'object') {
    const cfResp = rawResult as CloudflareAiResponse
    const payload = cfResp.response !== undefined ? cfResp.response : rawResult
    const tokens = cfResp.usage?.total_tokens ?? 0
    return parseAnalysisResponse(payload, 'cfAi', tokens)
  }

  throw new Error('cfAi binding returned an unexpected response type')
}
