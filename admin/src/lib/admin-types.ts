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

export type DefaultUserTier = 'free' | 'pro'

export const DEFAULT_NEW_USER_TIER: DefaultUserTier = 'free'

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

// --- Access Control (Ban & VIP Whitelist) ---

export interface BannedIpEntry {
  ipHash: string
  reason: string
  createdAt: string
  bannedBy?: string
}

export interface BannedUserEntry {
  userId: string
  email?: string
  reason: string
  createdAt: string
  bannedBy?: string
}

export interface VipUserEntry {
  userId: string
  email?: string
  note?: string
  addedAt: string
}

export interface VipIpEntry {
  ipHash: string
  note?: string
  addedAt: string
}

export interface AccessControlConfig {
  bannedIpHashes: BannedIpEntry[]
  bannedUserIds: BannedUserEntry[]
  vipUserIds: VipUserEntry[]
  vipIpHashes: VipIpEntry[]
  rateLimitPerMinute: number
  autoBanThresholdPerMin: number
}

export const DEFAULT_ACCESS_CONTROL_CONFIG: AccessControlConfig = {
  bannedIpHashes: [],
  bannedUserIds: [],
  vipUserIds: [],
  vipIpHashes: [],
  rateLimitPerMinute: 60,
  autoBanThresholdPerMin: 120
}

// --- Campaign & In-App Banners ---

export type CampaignTargetTier = 'all' | 'free' | 'pro'

export interface CampaignBannerItem {
  id: string
  title: string
  message: string
  badge?: string
  targetTier: CampaignTargetTier
  ctaText: string
  ctaUrl: string
  couponCode?: string
  enabled: boolean
  priority: number
  createdAt: string
  expiresAt?: string
}

export interface CampaignBannersConfig {
  banners: CampaignBannerItem[]
}

export const DEFAULT_CAMPAIGN_BANNERS_CONFIG: CampaignBannersConfig = {
  banners: [
    {
      id: 'banner_pro_launch',
      title: 'Desbloquea Análisis Ilimitados con Pro',
      message: 'Obtén diagramas de arquitectura interactivos Mermaid y chat ilimitado con Octo Mascot.',
      badge: '50% OFF',
      targetTier: 'free',
      ctaText: 'Actualizar a Pro',
      ctaUrl: 'https://github-intelligence.com/pricing',
      couponCode: 'LAUNCH50',
      enabled: true,
      priority: 1,
      createdAt: new Date().toISOString()
    }
  ]
}

// --- Telegram Webhook Alerts ---

export interface TelegramAlertsConfig {
  enabled: boolean
  botToken: string
  chatId: string
  notifyOnAiFallback: boolean
  notifyOnNewProSubscriber: boolean
  notifyOnErrorSpike: boolean
  notifyOnBan: boolean
  lastTestedAt?: string
}

export const DEFAULT_TELEGRAM_ALERTS_CONFIG: TelegramAlertsConfig = {
  enabled: false,
  botToken: '',
  chatId: '',
  notifyOnAiFallback: true,
  notifyOnNewProSubscriber: true,
  notifyOnErrorSpike: true,
  notifyOnBan: false
}

// --- Modular Billing & Payments (Lemon Squeezy, Stripe, Polar, Paddle) ---

export type BillingProviderName = 'lemonsqueezy' | 'stripe' | 'polar' | 'paddle'

export interface BillingSettingsConfig {
  activeProvider: BillingProviderName
  monthlyPriceUsd: number
  annualPriceUsd: number
  trialDays: number
  customCheckoutUrl?: string
  portalUrl?: string
  // Stripe
  stripePublishableKey?: string
  stripeSecretKey?: string
  stripeWebhookSecret?: string
  stripeMonthlyPriceId?: string
  stripeAnnualPriceId?: string
  // Lemon Squeezy (Legacy)
  lemonStoreId?: string
  lemonApiKey?: string
  lemonWebhookSecret?: string
  // Polar.sh
  polarAccessToken?: string
  polarOrganizationId?: string
  // Paddle
  paddleVendorId?: string
  paddleApiKey?: string
  paddleWebhookSecret?: string
}

export const DEFAULT_BILLING_SETTINGS_CONFIG: BillingSettingsConfig = {
  activeProvider: 'stripe',
  monthlyPriceUsd: 9,
  annualPriceUsd: 79,
  trialDays: 7,
  customCheckoutUrl: '',
  portalUrl: ''
}

// --- Admin Audit Log Entries ---

export interface AdminAuditLogEntry {
  id: string
  timestamp: string
  adminEmail: string
  action: string
  target: string
  details?: Record<string, unknown> | string
}

// --- User Feedback & CSAT ---

export interface FeedbackLocationsConfig {
  repo_explanation: boolean
  architecture: boolean
  file_explainer: boolean
  mascot: boolean
  overview: boolean
}

export const DEFAULT_FEEDBACK_LOCATIONS: FeedbackLocationsConfig = {
  repo_explanation: true,
  architecture: true,
  file_explainer: true,
  mascot: true,
  overview: true,
}

export interface UserFeedbackItem {
  id: string
  timestamp: string
  repo: string
  rating: 'positive' | 'negative'
  category: 'accuracy' | 'diagram' | 'mascot' | 'speed' | 'general'
  comment?: string
  provider?: string
  userId?: string
  location?: string
}

// ============================================================================
// 1. EXTENSION RELEASES & "WHAT'S NEW" MANAGER (/releases)
// ============================================================================

export interface WhatsNewHighlight {
  id: string
  icon: string // emoji or Lucide icon name, e.g. "sparkles", "zap", "shield", "rocket"
  title: string
  description: string
}

export interface WhatsNewModalConfig {
  enabled: boolean
  version: string
  releaseDate: string
  title: string
  summary: string
  highlights: WhatsNewHighlight[]
  blogUrl?: string
  ctaText?: string
  ctaUrl?: string
}

export interface ExtensionReleaseConfig {
  minSupportedVersion: string
  latestVersion: string
  updateUrl: string
  forceUpdateNotice: boolean
  forceUpdateMessage?: string
  whatsNew: WhatsNewModalConfig
}

export const DEFAULT_EXTENSION_RELEASE_CONFIG: ExtensionReleaseConfig = {
  minSupportedVersion: '1.2.0',
  latestVersion: '1.4.0',
  updateUrl: 'https://chromewebstore.google.com/detail/github-project-intelligence',
  forceUpdateNotice: false,
  forceUpdateMessage: 'Hay una actualización crítica de la extensión requerida para continuar disfrutando del análisis por IA.',
  whatsNew: {
    enabled: true,
    version: '1.4.0',
    releaseDate: '2026-11-26',
    title: '¡Bienvenido a GitHub Intelligence v1.4!',
    summary: 'Descubre diagramas de arquitectura en tiempo real, auditoría profunda de dependencias y la nueva Mascota IA integrada.',
    highlights: [
      {
        id: 'h1',
        icon: 'sparkles',
        title: 'Mascota Asistente en Dock',
        description: 'Chatea interactivamente con la mascota de ingeniería para resolver dudas de cualquier repositorio.'
      },
      {
        id: 'h2',
        icon: 'zap',
        title: 'Diagramas Mermaid Interactivos',
        description: 'Visualiza la arquitectura del código, capas de datos y flujo de peticiones en 1 solo clic.'
      },
      {
        id: 'h3',
        icon: 'shield',
        title: 'Auditoría de Seguridad & Stack',
        description: 'Evaluación instantánea de salud, compatibilidad de hardware local y posibles cuellos de botella.'
      }
    ],
    blogUrl: 'https://github.com',
    ctaText: '¡Comenzar a Explorar!',
    ctaUrl: ''
  }
}

// ============================================================================
// 2. FINOPS & AI COST ANALYTICS (/costs)
// ============================================================================

export interface ProviderPricingModel {
  provider: ProviderName
  modelName: string
  inputCostPerMillion: number // USD
  outputCostPerMillion: number // USD
  notes?: string
}

export const DEFAULT_PROVIDER_PRICING: Record<ProviderName, ProviderPricingModel> = {
  gemini: {
    provider: 'gemini',
    modelName: 'gemini-2.5-flash',
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.60,
    notes: 'Google AI Studio: Alta velocidad y bajo coste'
  },
  groq: {
    provider: 'groq',
    modelName: 'llama-3.3-70b-versatile',
    inputCostPerMillion: 0.59,
    outputCostPerMillion: 0.79,
    notes: 'Groq LPU: Máxima velocidad de inferencia'
  },
  cfAi: {
    provider: 'cfAi',
    modelName: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    inputCostPerMillion: 0.35,
    outputCostPerMillion: 0.55,
    notes: 'Cloudflare Workers AI en el Edge'
  },
  openRouter: {
    provider: 'openRouter',
    modelName: 'deepseek/deepseek-chat',
    inputCostPerMillion: 0.14,
    outputCostPerMillion: 0.28,
    notes: 'OpenRouter DeepSeek V3: Eficiencia extrema'
  }
}

export interface FinOpsBudgetConfig {
  monthlyBudgetUsd: number
  dailyBudgetUsd: number
  alertThresholdPercent: number
  hardStopEnabled: boolean
  notifyViaTelegram: boolean
  estimatedAvgInputTokensPerRepo: number
  estimatedAvgOutputTokensPerRepo: number
}

export const DEFAULT_FINOPS_BUDGET_CONFIG: FinOpsBudgetConfig = {
  monthlyBudgetUsd: 150,
  dailyBudgetUsd: 8,
  alertThresholdPercent: 80,
  hardStopEnabled: false,
  notifyViaTelegram: true,
  estimatedAvgInputTokensPerRepo: 2800,
  estimatedAvgOutputTokensPerRepo: 1200
}

export interface ProviderTokenUsageStats {
  provider: ProviderName
  requestCount: number
  inputTokens: number
  outputTokens: number
  totalCostUsd: number
  avgLatencyMs: number
}

// ============================================================================
// 3. REPOSITORY INTELLIGENCE LEADERBOARD & CACHE PRE-WARMING (/trends)
// ============================================================================

export interface RepoTrendItem {
  id: string
  repo: string // e.g. "facebook/react"
  analysisCount: number
  lastAnalyzedAt: string
  primaryLanguage: string
  stars?: number
  cached: boolean
  cacheExpiresAt?: string
  avgResponseTimeMs: number
  preferredProvider?: ProviderName
}

export interface CachePrewarmConfig {
  autoPrewarmTopRepos: boolean
  cronSchedule: 'hourly' | 'daily_midnight' | 'weekly'
  targetTopCount: number
  preferredProvider: ProviderName
  lastPrewarmRun?: string
  lastPrewarmSuccessCount?: number
  customRepoList: string[]
}

export const DEFAULT_CACHE_PREWARM_CONFIG: CachePrewarmConfig = {
  autoPrewarmTopRepos: true,
  cronSchedule: 'daily_midnight',
  targetTopCount: 15,
  preferredProvider: 'gemini',
  lastPrewarmRun: '',
  lastPrewarmSuccessCount: 0,
  customRepoList: [
    'facebook/react',
    'vercel/next.js',
    'tailwindlabs/tailwindcss',
    'shadcn-ui/ui',
    'astral-sh/uv',
    'vuejs/core',
    'oven-sh/bun',
    'denoland/deno',
    'angular/angular',
    'microsoft/vscode'
  ]
}

// ============================================================================
// 4. IN-APP NOTIFICATION CENTER & ANNOUNCEMENTS (/notifications)
// ============================================================================

export type InAppNotificationType = 'info' | 'feature' | 'warning' | 'announcement' | 'tip'

export interface InAppNotificationItem {
  id: string
  title: string
  message: string
  type: InAppNotificationType
  targetTier: 'all' | 'free' | 'pro'
  actionUrl?: string
  actionLabel?: string
  pinned: boolean
  active: boolean
  createdAt: string
  expiresAt?: string
  readCount?: number
  clickCount?: number
}

export interface InAppNotificationsConfig {
  notifications: InAppNotificationItem[]
}

export const DEFAULT_IN_APP_NOTIFICATIONS_CONFIG: InAppNotificationsConfig = {
  notifications: [
    {
      id: 'notif-welcome-v14',
      title: '¡Nueva versión 1.4 disponible!',
      message: 'Hemos agregado diagramas de arquitectura interactivos y chat con la mascota en repositorios públicos.',
      type: 'feature',
      targetTier: 'all',
      actionUrl: 'https://github.com',
      actionLabel: 'Ver novedades',
      pinned: true,
      active: true,
      createdAt: '2026-11-26T00:00:00.000Z',
      readCount: 1420,
      clickCount: 312
    },
    {
      id: 'notif-pro-black-friday',
      title: 'Descuento Especial Pro: 50% OFF',
      message: 'Usa el cupón GITHUBPRO en el checkout para obtener análisis ilimitados y auditorías profundas.',
      type: 'announcement',
      targetTier: 'free',
      actionUrl: '#upgrade',
      actionLabel: 'Aprovechar 50% OFF',
      pinned: false,
      active: true,
      createdAt: '2026-11-25T12:00:00.000Z',
      expiresAt: '2026-12-05T23:59:59.000Z',
      readCount: 980,
      clickCount: 184
    }
  ]
}

// ============================================================================
// 5. TEAM RBAC & ACCESS MANAGEMENT (/team)
// ============================================================================

export type AdminRole = 'super_admin' | 'developer' | 'marketing_support' | 'analyst_read_only'

export type AdminPermission =
  | 'all'
  | 'manage_keys'
  | 'manage_prompts'
  | 'manage_flags'
  | 'manage_campaigns'
  | 'manage_billing'
  | 'manage_releases'
  | 'manage_notifications'
  | 'manage_team'
  | 'view_analytics'
  | 'export_data'

export interface RolePermissionDefinition {
  role: AdminRole
  label: string
  badgeColor: string
  description: string
  permissions: AdminPermission[]
}

export const ADMIN_ROLE_DEFINITIONS: Record<AdminRole, RolePermissionDefinition> = {
  super_admin: {
    role: 'super_admin',
    label: 'Super Admin',
    badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    description: 'Acceso total y sin restricciones a todos los módulos, claves, facturación y gestión de equipo.',
    permissions: ['all']
  },
  developer: {
    role: 'developer',
    label: 'Ingeniero / Dev',
    badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    description: 'Control técnico de API keys, modelos IA, prompts, feature flags, telemetría y caché.',
    permissions: [
      'manage_keys',
      'manage_prompts',
      'manage_flags',
      'manage_releases',
      'view_analytics',
      'export_data'
    ]
  },
  marketing_support: {
    role: 'marketing_support',
    label: 'Marketing & Soporte',
    badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    description: 'Gestión de banners del dock, notificaciones in-app, cupones, facturación y feedback CSAT.',
    permissions: [
      'manage_campaigns',
      'manage_notifications',
      'manage_billing',
      'view_analytics'
    ]
  },
  analyst_read_only: {
    role: 'analyst_read_only',
    label: 'Analista (Solo Lectura)',
    badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    description: 'Visualización de telemetría, métricas de adopción, finanzas y exportación de reportes.',
    permissions: ['view_analytics', 'export_data']
  }
}

export interface TeamMemberItem {
  id: string
  email: string
  name: string
  role: AdminRole
  avatarUrl?: string
  status: 'active' | 'invited' | 'disabled'
  createdAt: string
  lastLoginAt?: string
  department?: string
}

export interface TeamRbacConfig {
  members: TeamMemberItem[]
  enforce2fa: boolean
  sessionTimeoutHours: number
}

export const DEFAULT_TEAM_RBAC_CONFIG: TeamRbacConfig = {
  members: [
    {
      id: 'mem-1',
      email: 'admin@github-intelligence.com',
      name: 'Super Administrador',
      role: 'super_admin',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastLoginAt: '2026-11-26T09:45:00.000Z',
      department: 'Dirección Técnica'
    },
    {
      id: 'mem-2',
      email: 'dev@github-intelligence.com',
      name: 'Lead AI Engineer',
      role: 'developer',
      status: 'active',
      createdAt: '2026-02-15T00:00:00.000Z',
      lastLoginAt: '2026-11-25T18:20:00.000Z',
      department: 'Inteligencia & Modelos'
    },
    {
      id: 'mem-3',
      email: 'growth@github-intelligence.com',
      name: 'Growth & Marketing Manager',
      role: 'marketing_support',
      status: 'active',
      createdAt: '2026-03-01T00:00:00.000Z',
      lastLoginAt: '2026-11-24T14:10:00.000Z',
      department: 'Marketing & Adquisición'
    }
  ],
  enforce2fa: false,
  sessionTimeoutHours: 24
}

// ============================================================================
// 6. DATA EXPORT & BACKUP CENTER (/export)
// ============================================================================

export type ExportDatasetType =
  | 'users'
  | 'csat_feedback'
  | 'audit_logs'
  | 'query_logs'
  | 'repo_trends'
  | 'full_kv_snapshot'

export interface ExportHistoryRecord {
  id: string
  dataset: ExportDatasetType
  format: 'json' | 'csv'
  rowCount: number
  fileSizeBytes: number
  exportedAt: string
  exportedBy: string
}

