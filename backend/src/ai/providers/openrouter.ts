import type { AIConfig, AnalysisResult, RepoContext } from '../types'
import { callOpenAICompatibleProvider } from './shared'

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_MODEL = 'deepseek/deepseek-chat'

/** Analyzes a repository using OpenRouter (DeepSeek V3 failsafe). */
export async function analyzeWithOpenRouter(
  context: RepoContext,
  config: AIConfig
): Promise<AnalysisResult> {
  return callOpenAICompatibleProvider({
    provider: 'openRouter',
    endpoint: OPENROUTER_ENDPOINT,
    apiKey: config.openRouterApiKey,
    model: OPENROUTER_MODEL,
    context,
    systemPrompt: config.systemPrompt,
    timeoutMs: config.timeoutMs,
    extraHeaders: {
      'X-Title': 'GitHub Intelligence Extension'
    }
  })
}
