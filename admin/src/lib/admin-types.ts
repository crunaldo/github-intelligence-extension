export type ProviderName = 'gemini' | 'groq' | 'cfAi' | 'openRouter'

export const ALL_PROVIDERS: ProviderName[] = ['gemini', 'groq', 'cfAi', 'openRouter']

export const PROVIDER_LABELS: Record<ProviderName, { label: string; model: string }> = {
  gemini: { label: 'Google Gemini', model: 'gemini-2.5-flash' },
  groq: { label: 'Groq', model: 'llama-3.3-70b-versatile' },
  cfAi: { label: 'Cloudflare Workers AI', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
  openRouter: { label: 'OpenRouter', model: 'openrouter/auto' }
}

export interface FeatureFlagsConfig {
  mascot_enabled: boolean
  diagrams_enabled: boolean
  maintenance_mode: boolean
  banner_message?: string
}

export const DEFAULT_FREE_DAILY_LIMIT = 15
export const DEFAULT_PRO_DAILY_LIMIT = 250

export const DEFAULT_FEATURE_FLAGS: FeatureFlagsConfig = {
  mascot_enabled: true,
  diagrams_enabled: true,
  maintenance_mode: false,
  banner_message: ''
}

export const DEFAULT_SYSTEM_PROMPT_REPO =
  'You are GitHub Project Intelligence. Analyze the repository README and package manifests to produce structured technical insights, architecture Mermaid diagram, strengths, and concerns in valid JSON.'

export const DEFAULT_SYSTEM_PROMPT_MASCOT =
  'You are the GitHub Intelligence Mascot assistant. Answer questions about the current repository concisely, accurately, and in a friendly engineering tone grounded in the repository summary context.'

export interface ProfileRow {
  id: string
  email: string
  role: 'user' | 'admin'
  lemon_customer_id: string | null
  is_pro: boolean
  created_at: string
}

export interface SubscriptionRow {
  id: string
  user_id: string | null
  lemon_subscription_id: string
  status: 'active' | 'past_due' | 'cancelled' | 'expired' | string
  variant_id: string | null
  current_period_end: string | null
  created_at: string
  updated_at: string
}

export interface QueryLogRow {
  id: string
  user_id: string | null
  client_fingerprint: string | null
  ip_hash: string
  repo_full_name: string
  is_pro: boolean
  cache_hit: boolean
  provider: string | null
  action_type: 'analysis' | 'mascot_chat'
  response_time_ms: number | null
  created_at: string
}

export interface RepoAnalysisRow {
  id: string
  repo_full_name: string
  commit_sha: string
  summary_json: Record<string, unknown>
  architecture_diagram: string | null
  primary_language: string | null
  provider_used: string | null
  tokens_consumed: number
  created_at: string
}

export interface RemoteConfigRow {
  key: string
  value: unknown
  description?: string | null
  updated_at: string
}
