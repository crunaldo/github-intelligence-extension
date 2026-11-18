import { analyzeWithCloudflareAi } from './providers/cloudflare-ai'
import { analyzeWithGemini } from './providers/gemini'
import { analyzeWithGroq } from './providers/groq'
import { analyzeWithOpenRouter } from './providers/openrouter'
import {
  AIProvidersExhaustedError,
  type AIConfig,
  type AnalysisResult,
  type ProviderFailure,
  type ProviderFn,
  type ProviderName,
  type RepoContext
} from './types'

export const DEFAULT_PRIORITY_ORDER: readonly ProviderName[] = [
  'gemini',
  'groq',
  'cfAi',
  'openRouter'
]

const DEFAULT_PROVIDERS: Record<ProviderName, ProviderFn> = {
  gemini: analyzeWithGemini,
  groq: analyzeWithGroq,
  cfAi: analyzeWithCloudflareAi,
  openRouter: analyzeWithOpenRouter
}

/**
 * Generates a single-pass repository analysis using automatic multi-provider
 * fallback (`gemini` -> `groq` -> `cfAi` -> `openRouter` by default).
 */
export async function generateRepoAnalysis(
  context: RepoContext,
  config: AIConfig = {}
): Promise<AnalysisResult> {
  const configuredOrder =
    config.priorityOrder && config.priorityOrder.length > 0
      ? config.priorityOrder
      : DEFAULT_PRIORITY_ORDER
  const order = Array.from(new Set(configuredOrder))

  const failures: ProviderFailure[] = []

  for (const providerName of order) {
    const providerFn = config.providers?.[providerName] ?? DEFAULT_PROVIDERS[providerName]
    if (!providerFn) {
      failures.push({ provider: providerName, message: `Unknown provider "${providerName}"` })
      continue
    }

    try {
      return await providerFn(context, config)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push({ provider: providerName, message })
    }
  }

  throw new AIProvidersExhaustedError(failures)
}
