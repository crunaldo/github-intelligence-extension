export type ProviderName = 'gemini' | 'groq' | 'cfAi' | 'openRouter'

export interface KVNamespace {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

export interface ApiKeyItem {
  id: string
  provider: ProviderName
  label: string
  key: string
  enabled: boolean
  createdAt?: string
  lastUsedAt?: string
  callsCount?: number
  errorCount?: number
}

export type KeyRotationStrategy = 'round_robin' | 'priority_fallback'

export interface ProviderApiKeysConfig {
  keys: ApiKeyItem[]
  strategy: KeyRotationStrategy
}

export type ModuleAccessLevel = 'free' | 'pro' | 'disabled'

export type AnalysisModuleId =
  | 'summary'
  | 'installCommand'
  | 'cloudSandbox'
  | 'hardwareCompat'
  | 'roadmap'
  | 'repoHealth'
  | 'architectureDiagram'
  | 'deepAudit'
  | 'fileTree'
  | 'dependencies'
  | 'mascotChat'
  | 'exportReport'

export type AnalysisModulesMap = Record<AnalysisModuleId, ModuleAccessLevel>

export interface RepoContext {
  owner: string
  repo: string
  commitSha: string
  readme: string
  manifests: Record<string, string>
}

export interface AnalysisResult {
  summary: {
    headline: string
    whatItIs: string
    whyItMatters: string
    practicalUse: string
    targetAudience: string
    stackPills: string[]
  }
  architectureDiagram: string // Mermaid syntax
  deepAudit: {
    strengths: string[]
    concerns: string[]
  }
  providerUsed: string
  tokensConsumed: number
}

export type ProviderFn = (context: RepoContext, config: AIConfig) => Promise<AnalysisResult>

export interface AIConfig {
  providers?: Partial<Record<ProviderName, ProviderFn>>
  priorityOrder?: ProviderName[]
  systemPrompt?: string
  timeoutMs?: number
  geminiApiKey?: string
  groqApiKey?: string
  cfAiBinding?: { run: (model: string, input: unknown) => Promise<unknown> }
  openRouterApiKey?: string
  apiKeysPool?: ApiKeyItem[]
  keyRotationStrategy?: KeyRotationStrategy
}

export interface ProviderFailure {
  provider: ProviderName
  message: string
}

/** Error thrown when every configured AI provider in the fallback chain fails. */
export class AIProvidersExhaustedError extends Error {
  readonly code = 'AI_PROVIDERS_EXHAUSTED'
  readonly failures: ProviderFailure[]

  constructor(failures: ProviderFailure[]) {
    const details = failures.map((f) => `${f.provider}: ${f.message}`).join('; ')
    super(`AI_PROVIDERS_EXHAUSTED: All AI providers failed (${details})`)
    this.name = 'AIProvidersExhaustedError'
    this.failures = failures
  }
}
