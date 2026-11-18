import { analyzeWithCloudflareAi } from './providers/cloudflare-ai'
import { analyzeWithGemini } from './providers/gemini'
import { analyzeWithGroq } from './providers/groq'
import { analyzeWithOpenRouter } from './providers/openrouter'
import {
  AIProvidersExhaustedError,
  type AIConfig,
  type AnalysisResult,
  type ApiKeyItem,
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

/**
 * Generates a single-pass repository analysis using automatic multi-provider
 * fallback (`gemini` -> `groq` -> `cfAi` -> `openRouter` by default)
 * with multi-key pooling and intra-provider failover.
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

    // Check if there is an active API key pool for this provider
    const poolKeys = (config.apiKeysPool ?? []).filter(
      (item): item is ApiKeyItem =>
        item.provider === providerName && item.enabled && Boolean(item.key?.trim())
    )

    if (poolKeys.length > 0) {
      // Order keys based on strategy: round_robin starts at random offset, priority_fallback starts at 0
      const orderedKeys = [...poolKeys]
      if (config.keyRotationStrategy === 'round_robin' && orderedKeys.length > 1) {
        const offset = Math.floor(Math.random() * orderedKeys.length)
        orderedKeys.push(...orderedKeys.splice(0, offset))
      }

      let providerSucceeded = false
      for (const keyItem of orderedKeys) {
        try {
          const keyConfig = resolveProviderSpecificConfig(providerName, keyItem.key, config)
          const result = await providerFn(context, keyConfig)
          providerSucceeded = true
          return result
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          failures.push({
            provider: providerName,
            message: `Key "${keyItem.label || keyItem.id}": ${message}`
          })
          // If this key failed, loop continues to the NEXT key in the pool for this provider!
        }
      }

      if (providerSucceeded) continue
    } else {
      // Standard single-key execution using base config
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
