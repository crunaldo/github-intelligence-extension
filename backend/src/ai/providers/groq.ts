import type { AIConfig, AnalysisResult, RepoContext } from '../types'
import { callOpenAICompatibleProvider } from './shared'

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

/** Analyzes a repository using Groq Llama 3.3 70B. */
export async function analyzeWithGroq(
  context: RepoContext,
  config: AIConfig
): Promise<AnalysisResult> {
  return callOpenAICompatibleProvider({
    provider: 'groq',
    endpoint: GROQ_ENDPOINT,
    apiKey: config.groqApiKey,
    model: GROQ_MODEL,
    context,
    systemPrompt: config.systemPrompt,
    timeoutMs: config.timeoutMs
  })
}
