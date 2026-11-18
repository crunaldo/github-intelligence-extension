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
  'You are an expert software architect for GitHub Project Intelligence. Analyze the repository README and package manifests to produce concise, accurate technical insights, a Mermaid architecture diagram, strengths, and concerns. (The required JSON output schema is automatically enforced by the Edge Worker.)'

export const DEFAULT_SYSTEM_PROMPT_MASCOT =
  'You are the GitHub Intelligence Mascot assistant. Answer questions about the current repository concisely, accurately, and in a friendly engineering tone grounded in the repository summary context.'

// --- Multi-API Key Pooling Types ---

export interface ApiKeyItem {
  id: string
  provider: ProviderName
  label: string // e.g. "Gemini - Cuenta Juan", "Gemini - Proyecto 2"
  key: string
  enabled: boolean
  createdAt: string
  lastUsedAt?: string
  callsCount?: number
  errorCount?: number
}

export type KeyRotationStrategy = 'round_robin' | 'priority_fallback'

export interface ProviderApiKeysConfig {
  keys: ApiKeyItem[]
  strategy: KeyRotationStrategy
}

export const DEFAULT_PROVIDER_API_KEYS: ProviderApiKeysConfig = {
  keys: [],
  strategy: 'priority_fallback'
}

// --- Analysis Modules & Plan Access Toggles (Free vs Pro) ---

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

export interface AnalysisModuleDef {
  id: AnalysisModuleId
  name: string
  description: string
  category: 'core' | 'ai' | 'developer' | 'insights'
  defaultAccess: ModuleAccessLevel
}

export type AnalysisModulesMap = Record<AnalysisModuleId, ModuleAccessLevel>

export const DEFAULT_ANALYSIS_MODULES: AnalysisModuleDef[] = [
  {
    id: 'summary',
    name: 'Resumen Ejecutivo & Coloquial',
    description: 'Headline, qué es el proyecto, por qué importa y público objetivo en español claro.',
    category: 'core',
    defaultAccess: 'free'
  },
  {
    id: 'installCommand',
    name: 'Comando de Instalación en 1-Clic',
    description: 'Detección automática de npm, cargo, pip, go o docker run según los manifests.',
    category: 'developer',
    defaultAccess: 'free'
  },
  {
    id: 'cloudSandbox',
    name: 'Apertura en la Nube (Sandboxes & IDEs)',
    description: 'Botones rápidos para clonar y ejecutar en StackBlitz, CodeSandbox, Codespaces y VS Code.',
    category: 'developer',
    defaultAccess: 'free'
  },
  {
    id: 'hardwareCompat',
    name: 'Compatibilidad de Hardware del PC',
    description: 'Auditoría inteligente de CPU, GPU, memoria RAM y compatibilidad con el proyecto.',
    category: 'insights',
    defaultAccess: 'free'
  },
  {
    id: 'roadmap',
    name: 'Roadmap Rápido de Puesta en Marcha',
    description: 'Guía paso a paso para clonar, configurar entorno y compilar el repositorio.',
    category: 'developer',
    defaultAccess: 'free'
  },
  {
    id: 'repoHealth',
    name: 'Índice de Salud & Actividad',
    description: 'Métricas de mantenimiento, frecuencia de commits, velocidad de PRs y tasa de issues cerrados.',
    category: 'insights',
    defaultAccess: 'free'
  },
  {
    id: 'architectureDiagram',
    name: 'Diagrama Visual de Arquitectura (Mermaid)',
    description: 'Diagrama de flujo interactivo generado por IA con componentes, capas y tecnologías.',
    category: 'ai',
    defaultAccess: 'pro'
  },
  {
    id: 'deepAudit',
    name: 'Auditoría Técnica Profunda (Fortalezas & Riesgos)',
    description: 'Auditoría de arquitectura, código, buenas prácticas y posibles cuellos de botella.',
    category: 'ai',
    defaultAccess: 'pro'
  },
  {
    id: 'fileTree',
    name: 'Explorador de Archivos Clave & Estructura',
    description: 'Árbol de directorios navegable filtrando archivos importantes y configuraciones.',
    category: 'core',
    defaultAccess: 'free'
  },
  {
    id: 'dependencies',
    name: 'Inspector de Dependencias & Manifests',
    description: 'Desglose detallado de package.json, Cargo.toml, pyproject.toml con runtime specs.',
    category: 'insights',
    defaultAccess: 'free'
  },
  {
    id: 'mascotChat',
    name: 'Asistente Octo Chat Interactivo',
    description: 'Chat interactivo en tiempo real con la mascota entrenada en el contexto del repositorio.',
    category: 'ai',
    defaultAccess: 'pro'
  },
  {
    id: 'exportReport',
    name: 'Exportación de Reportes (Markdown / JSON)',
    description: 'Descarga y copiado rápido del informe completo estructurado para equipos.',
    category: 'core',
    defaultAccess: 'free'
  }
]

export const DEFAULT_ANALYSIS_MODULES_MAP: AnalysisModulesMap = {
  summary: 'free',
  installCommand: 'free',
  cloudSandbox: 'free',
  hardwareCompat: 'free',
  roadmap: 'free',
  repoHealth: 'free',
  architectureDiagram: 'pro',
  deepAudit: 'pro',
  fileTree: 'free',
  dependencies: 'free',
  mascotChat: 'pro',
  exportReport: 'free'
}

// --- Advanced System Settings ---

export interface AdvancedSystemSettings {
  ipDailyCeiling: number
  headCacheTtlHours: number
  commitCacheTtlHours: number
  providerTimeoutMs: number
  logIpHashes: boolean
  logFingerprints: boolean
  preferredGeminiModel: string
  preferredGroqModel: string
}

export const DEFAULT_ADVANCED_SETTINGS: AdvancedSystemSettings = {
  ipDailyCeiling: 45,
  headCacheTtlHours: 1,
  commitCacheTtlHours: 24,
  providerTimeoutMs: 15000,
  logIpHashes: true,
  logFingerprints: true,
  preferredGeminiModel: 'gemini-2.0-flash',
  preferredGroqModel: 'llama-3.3-70b-versatile'
}

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
