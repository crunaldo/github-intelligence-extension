import {
  handleMascotChatRequest,
  InvalidMascotRequestError,
  type MascotChatMessage,
  type MascotChatOptions
} from './ai/mascot-chat'
import { generateRepoAnalysis } from './ai/router'
import {
  AIProvidersExhaustedError,
  type AnalysisResult,
  type ApiKeyItem,
  type KeyRotationStrategy,
  type KVNamespace,
  type ModuleAccessLevel,
  type ProviderApiKeysConfig,
  type ProviderName
} from './ai/types'
import {
  getCachedAnalysis,
  getLatestCachedCommitSha,
  setCachedAnalysis,
  setLatestCachedCommitSha
} from './cache/repo-cache'
import { checkAndIncrementQuota, deriveAnonymousIdentifier } from './middleware/rate-limiter'
import { filterResponseForRole, type FilteredAnalysisResult } from './middleware/role-filter'
import {
  handleLemonSqueezyWebhook,
  type SupabaseClientLike,
  type SupabaseQueryResult,
  type SupabaseSelectFilter,
  type SupabaseSelectQueryResult
} from './webhooks/lemonsqueezy'

export interface WorkerExecutionContext {
  waitUntil?: (promise: Promise<unknown>) => void
}

export interface WorkerEnv {
  KV: KVNamespace
  GEMINI_API_KEY?: string
  GROQ_API_KEY?: string
  OPENROUTER_API_KEY?: string
  AI?: { run: (model: string, input: unknown) => Promise<unknown> }
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  LEMON_SQUEEZY_WEBHOOK_SECRET?: string
  verifyProUser?: (token: string, env: WorkerEnv) => Promise<{ isPro: boolean; userId: string | null }>
  createSupabaseClient?: (env: WorkerEnv) => SupabaseClientLike
  analyzeRepo?: typeof generateRepoAnalysis
  chatProviders?: MascotChatOptions['chatProviders']
}

interface RemoteConfigResponse {
  free_daily_limit: number
  pro_daily_limit: number
  feature_flags: {
    mascot_enabled: boolean
    diagrams_enabled: boolean
    maintenance_mode: boolean
    [key: string]: unknown
  }
  analysis_modules: Record<string, ModuleAccessLevel>
  advanced_system_settings?: Record<string, unknown>
}

const DEFAULT_ANALYSIS_MODULES: Record<string, ModuleAccessLevel> = {
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

const DEFAULT_FREE_DAILY_LIMIT = 15
const DEFAULT_PRO_DAILY_LIMIT = 250
const DEFAULT_IP_DAILY_CEILING = 45
const MANIFEST_FILES = ['package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod'] as const
const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9_.-]+$/
const VALID_PROVIDERS = new Set<ProviderName>(['gemini', 'groq', 'cfAi', 'openRouter'])

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Signature, X-Signature'
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS
    }
  })
}

function isSafeRepoSegment(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value !== '.' &&
    !value.includes('..') &&
    SAFE_SEGMENT_PATTERN.test(value)
  )
}

function parsePositiveInteger(raw: string | null, fallback: number): number {
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

async function deriveIpHashHex(request: Request): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP')?.trim() || '0.0.0.0'
  const payload = new TextEncoder().encode(ip)
  const digest = await crypto.subtle.digest('SHA-256', payload)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function deriveIpCeilingIdentifier(request: Request): Promise<string> {
  return `ip:${await deriveIpHashHex(request)}`
}

function isSupabaseConfigured(env: WorkerEnv): boolean {
  return Boolean(env.createSupabaseClient || (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY))
}

function scheduleBackgroundTask(
  ctx: WorkerExecutionContext | undefined,
  task: () => Promise<void>
): void {
  const safePromise = task().catch(() => {
    // Persistence and telemetry writes must never fail user-facing Worker responses
  })
  if (typeof ctx?.waitUntil === 'function') {
    ctx.waitUntil(safePromise)
  }
}

async function verifySupabaseUser(
  token: string,
  env: WorkerEnv
): Promise<{ isPro: boolean; userId: string | null }> {
  try {
    if (env.verifyProUser) {
      return await env.verifyProUser(token, env)
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return { isPro: false, userId: null }
    }

    const baseUrl = env.SUPABASE_URL.replace(/\/+$/, '')
    const authRes = await fetch(`${baseUrl}/auth/v1/user`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${token}`
      }
    })
    if (!authRes.ok) {
      return { isPro: false, userId: null }
    }

    const authUser = (await authRes.json()) as { id?: string }
    if (!authUser?.id) {
      return { isPro: false, userId: null }
    }

    const profileRes = await fetch(
      `${baseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}&select=is_pro`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    )
    if (!profileRes.ok) {
      return { isPro: false, userId: authUser.id }
    }

    const profiles = (await profileRes.json()) as Array<{ is_pro?: boolean }>
    return {
      isPro: Boolean(profiles?.[0]?.is_pro),
      userId: authUser.id
    }
  } catch {
    return { isPro: false, userId: null }
  }
}

function createRestSupabaseClient(env: WorkerEnv): SupabaseClientLike {
  if (env.createSupabaseClient) {
    return env.createSupabaseClient(env)
  }

  const getCredentials = () => {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_NOT_CONFIGURED')
    }
    return {
      baseUrl: env.SUPABASE_URL.replace(/\/+$/, ''),
      serviceKey: env.SUPABASE_SERVICE_ROLE_KEY
    }
  }

  const toQueryResult = async (res: Response): Promise<SupabaseQueryResult> => {
    if (res.ok) return { error: null }
    const text = await res.text()
    return { error: { message: text || `HTTP ${res.status}` } }
  }

  return {
    from(table: string) {
      return {
        async upsert(values, options) {
          const { baseUrl, serviceKey } = getCredentials()
          const conflictQuery = options?.onConflict
            ? `?on_conflict=${encodeURIComponent(options.onConflict)}`
            : ''
          const res = await fetch(`${baseUrl}/rest/v1/${table}${conflictQuery}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              Prefer: 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify(values)
          })
          return toQueryResult(res)
        },
        async insert(values) {
          const { baseUrl, serviceKey } = getCredentials()
          const res = await fetch(`${baseUrl}/rest/v1/${table}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              Prefer: 'return=minimal'
            },
            body: JSON.stringify(values)
          })
          return toQueryResult(res)
        },
        update(values) {
          return {
            async eq(column: string, value: string) {
              const { baseUrl, serviceKey } = getCredentials()
              const res = await fetch(
                `${baseUrl}/rest/v1/${table}?${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}`,
                {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    apikey: serviceKey,
                    Authorization: `Bearer ${serviceKey}`,
                    Prefer: 'return=minimal'
                  },
                  body: JSON.stringify(values)
                }
              )
              return toQueryResult(res)
            }
          }
        },
        select(columns: string) {
          const createFilter = (filters: string[], limitCount?: number): SupabaseSelectFilter => {
            const execute = async (): Promise<SupabaseSelectQueryResult> => {
              const { baseUrl, serviceKey } = getCredentials()
              const params = [...filters, `select=${encodeURIComponent(columns)}`]
              if (typeof limitCount === 'number') {
                params.push(`limit=${limitCount}`)
              }
              const res = await fetch(`${baseUrl}/rest/v1/${table}?${params.join('&')}`, {
                method: 'GET',
                headers: {
                  apikey: serviceKey,
                  Authorization: `Bearer ${serviceKey}`
                }
              })
              if (!res.ok) {
                const text = await res.text()
                return { data: null, error: { message: text || `HTTP ${res.status}` } }
              }
              const data = (await res.json()) as Array<Record<string, unknown>>
              return { data, error: null }
            }

            return {
              eq(column: string, value: string) {
                return createFilter(
                  [...filters, `${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}`],
                  limitCount
                )
              },
              limit(count: number) {
                return createFilter(filters, count)
              },
              then(onfulfilled, onrejected) {
                return execute().then(onfulfilled, onrejected)
              }
            }
          }

          return {
            eq(column: string, value: string) {
              return createFilter([`${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}`])
            }
          }
        }
      }
    }
  }
}

async function fetchTextIfOk(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

async function ingestRepositoryContext(owner: string, repo: string, commitSha: string) {
  const baseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${commitSha}`

  const readmePromise = (async () => {
    const primary = await fetchTextIfOk(`${baseUrl}/README.md`)
    if (primary !== null) return primary
    return (await fetchTextIfOk(`${baseUrl}/readme.md`)) ?? ''
  })()

  const manifestEntriesPromise = Promise.all(
    MANIFEST_FILES.map(async (filename) => {
      const content = await fetchTextIfOk(`${baseUrl}/${filename}`)
      return content !== null ? ([filename, content] as const) : null
    })
  )

  const [readme, manifestEntries] = await Promise.all([readmePromise, manifestEntriesPromise])
  const manifests: Record<string, string> = {}
  for (const entry of manifestEntries) {
    if (entry && entry[1].trim().length > 0) {
      manifests[entry[0]] = entry[1]
    }
  }

  return { readme, manifests }
}

async function readRemoteConfig(kv: KVNamespace): Promise<RemoteConfigResponse> {
  const [freeRaw, proRaw, flagsRaw, modulesRaw, settingsRaw] = await Promise.all([
    kv.get('free_daily_limit'),
    kv.get('pro_daily_limit'),
    kv.get('feature_flags'),
    kv.get('analysis_modules'),
    kv.get('advanced_system_settings')
  ])

  const defaults = {
    mascot_enabled: true,
    diagrams_enabled: true,
    maintenance_mode: false
  }

  let parsedFlags: Record<string, unknown> = {}
  if (flagsRaw) {
    try {
      const candidate: unknown = JSON.parse(flagsRaw)
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        parsedFlags = candidate as Record<string, unknown>
      }
    } catch {
      parsedFlags = {}
    }
  }

  let parsedModules: Record<string, ModuleAccessLevel> = { ...DEFAULT_ANALYSIS_MODULES }
  if (modulesRaw) {
    try {
      const candidate: unknown = JSON.parse(modulesRaw)
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        for (const [key, val] of Object.entries(candidate as Record<string, unknown>)) {
          if (val === 'free' || val === 'pro' || val === 'disabled') {
            parsedModules[key] = val
          }
        }
      }
    } catch {
      // Use defaults
    }
  }

  let parsedSettings: Record<string, unknown> | undefined = undefined
  if (settingsRaw) {
    try {
      const candidate: unknown = JSON.parse(settingsRaw)
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        parsedSettings = candidate as Record<string, unknown>
      }
    } catch {
      // Ignore
    }
  }

  return {
    free_daily_limit: parsePositiveInteger(freeRaw, DEFAULT_FREE_DAILY_LIMIT),
    pro_daily_limit: parsePositiveInteger(proRaw, DEFAULT_PRO_DAILY_LIMIT),
    feature_flags: {
      ...defaults,
      ...parsedFlags
    },
    analysis_modules: parsedModules,
    ...(parsedSettings ? { advanced_system_settings: parsedSettings } : {})
  }
}

async function readProviderApiKeys(kv: KVNamespace): Promise<ProviderApiKeysConfig> {
  const raw = await kv.get('provider_api_keys')
  if (!raw) return { keys: [], strategy: 'priority_fallback' }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { keys: [], strategy: 'priority_fallback' }
    }
    const obj = parsed as Record<string, unknown>
    const strategy: KeyRotationStrategy =
      obj.strategy === 'round_robin' ? 'round_robin' : 'priority_fallback'
    const keys: ApiKeyItem[] = []
    if (Array.isArray(obj.keys)) {
      for (const item of obj.keys) {
        if (
          item &&
          typeof item === 'object' &&
          typeof item.id === 'string' &&
          typeof item.provider === 'string' &&
          VALID_PROVIDERS.has(item.provider as ProviderName) &&
          typeof item.key === 'string' &&
          item.key.trim().length > 0
        ) {
          keys.push({
            id: item.id,
            provider: item.provider as ProviderName,
            label: typeof item.label === 'string' ? item.label : item.provider,
            key: item.key.trim(),
            enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
            createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
            callsCount: typeof item.callsCount === 'number' ? item.callsCount : 0,
            errorCount: typeof item.errorCount === 'number' ? item.errorCount : 0
          })
        }
      }
    }
    return { keys, strategy }
  } catch {
    return { keys: [], strategy: 'priority_fallback' }
  }
}

async function readProviderPriority(kv: KVNamespace): Promise<ProviderName[] | undefined> {
  const raw = await kv.get('provider_priority')
  if (!raw) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return undefined
    const filtered = parsed.filter(
      (item): item is ProviderName => typeof item === 'string' && VALID_PROVIDERS.has(item as ProviderName)
    )
    return filtered.length > 0 ? filtered : undefined
  } catch {
    return undefined
  }
}

function maintenanceModeResponse(config: RemoteConfigResponse): Response {
  return jsonResponse(
    {
      error: 'MAINTENANCE_MODE',
      message: String(
        config.feature_flags.banner_message || 'Service is temporarily under maintenance.'
      )
    },
    503
  )
}

function buildAnalyzeResponsePayload(
  analysis: AnalysisResult,
  isPro: boolean,
  config: RemoteConfigResponse
): FilteredAnalysisResult {
  const filtered = filterResponseForRole(analysis, isPro)
  const modules = config.analysis_modules ?? {}

  const diagramsAccess =
    config.feature_flags.diagrams_enabled === false
      ? 'disabled'
      : (modules.architectureDiagram ?? 'pro')
  const deepAuditAccess = modules.deepAudit ?? 'pro'

  let result = { ...filtered }

  if ('architectureDiagram' in result) {
    if (diagramsAccess === 'disabled' || (diagramsAccess === 'pro' && !isPro)) {
      const { architectureDiagram: _omitted, ...rest } = result
      result = rest as FilteredAnalysisResult
    }
  }

  if ('deepAudit' in result) {
    if (deepAuditAccess === 'disabled' || (deepAuditAccess === 'pro' && !isPro)) {
      const { deepAudit: _omitted, ...rest } = result
      result = rest as FilteredAnalysisResult
    }
  }

  return result
}

function persistRepoAnalysis(
  env: WorkerEnv,
  ctx: WorkerExecutionContext | undefined,
  owner: string,
  repo: string,
  commitSha: string,
  analysis: AnalysisResult
): void {
  if (!isSupabaseConfigured(env)) return
  scheduleBackgroundTask(ctx, async () => {
    const supabase = createRestSupabaseClient(env)
    await supabase.from('repo_analyses').upsert(
      {
        repo_full_name: `${owner.toLowerCase()}/${repo.toLowerCase()}`,
        commit_sha: commitSha,
        summary_json: analysis.summary,
        architecture_diagram: analysis.architectureDiagram,
        provider_used: analysis.providerUsed,
        tokens_consumed: analysis.tokensConsumed
      },
      { onConflict: 'repo_full_name,commit_sha' }
    )
  })
}

function recordQueryLog(
  env: WorkerEnv,
  ctx: WorkerExecutionContext | undefined,
  request: Request,
  entry: {
    userId: string | null
    owner: string
    repo: string
    isPro: boolean
    cacheHit: boolean
    provider: string | null
    actionType: 'analysis' | 'mascot_chat'
    startedAt: number
  }
): void {
  if (!isSupabaseConfigured(env)) return
  const clientFingerprint = request.headers.get('X-Client-Signature')?.trim() || null
  const responseTimeMs = Math.max(0, Math.round(Date.now() - entry.startedAt))

  scheduleBackgroundTask(ctx, async () => {
    const ipHash = await deriveIpHashHex(request)
    const supabase = createRestSupabaseClient(env)
    const table = supabase.from('query_logs')
    if (typeof table.insert === 'function') {
      await table.insert({
        user_id: entry.userId,
        client_fingerprint: clientFingerprint,
        ip_hash: ipHash,
        repo_full_name: `${entry.owner.toLowerCase()}/${entry.repo.toLowerCase()}`,
        is_pro: entry.isPro,
        cache_hit: entry.cacheHit,
        provider: entry.provider,
        action_type: entry.actionType,
        response_time_ms: responseTimeMs
      })
    }
  })
}

async function tryReadRepoAnalysisFromSupabase(
  owner: string,
  repo: string,
  commitSha: string,
  env: WorkerEnv
): Promise<AnalysisResult | null> {
  if (!isSupabaseConfigured(env)) return null
  try {
    const supabase = createRestSupabaseClient(env)
    const table = supabase.from('repo_analyses')
    if (typeof table.select !== 'function') return null

    const firstFilter = table
      .select('summary_json,architecture_diagram,provider_used,tokens_consumed')
      .eq('repo_full_name', `${owner.toLowerCase()}/${repo.toLowerCase()}`)
    if (!firstFilter || typeof (firstFilter as SupabaseSelectFilter).eq !== 'function') {
      return null
    }

    const secondFilter = (firstFilter as SupabaseSelectFilter).eq('commit_sha', commitSha)
    const finalQuery =
      typeof (secondFilter as SupabaseSelectFilter).limit === 'function'
        ? (secondFilter as SupabaseSelectFilter).limit!(1)
        : secondFilter
    const res = await finalQuery
    if (!res || res.error || !Array.isArray(res.data) || res.data.length === 0) {
      return null
    }

    const row = res.data[0]
    const summary = row?.summary_json as AnalysisResult['summary'] | undefined
    const architectureDiagram = row?.architecture_diagram
    if (
      !summary ||
      typeof summary !== 'object' ||
      typeof summary.headline !== 'string' ||
      typeof summary.whatItIs !== 'string' ||
      typeof summary.whyItMatters !== 'string' ||
      typeof summary.practicalUse !== 'string' ||
      typeof summary.targetAudience !== 'string' ||
      !Array.isArray(summary.stackPills) ||
      typeof architectureDiagram !== 'string' ||
      architectureDiagram.trim().length === 0
    ) {
      return null
    }

    return {
      summary,
      architectureDiagram,
      deepAudit: { strengths: [], concerns: [] },
      providerUsed:
        typeof row.provider_used === 'string' && row.provider_used.length > 0
          ? row.provider_used
          : 'cache',
      tokensConsumed:
        typeof row.tokens_consumed === 'number' && Number.isFinite(row.tokens_consumed)
          ? row.tokens_consumed
          : 0
    }
  } catch {
    return null
  }
}

async function handleAnalyze(
  request: Request,
  env: WorkerEnv,
  ctx?: WorkerExecutionContext
): Promise<Response> {
  const startedAt = Date.now()
  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return jsonResponse({ error: 'INVALID_REQUEST', message: 'JSON object body required' }, 400)
    }
    body = parsed as Record<string, unknown>
  } catch {
    return jsonResponse({ error: 'INVALID_REQUEST', message: 'Invalid JSON body' }, 400)
  }

  const owner = body.owner
  const repo = body.repo
  const commitSha = body.commitSha ?? body.commit_sha

  if (!isSafeRepoSegment(owner) || !isSafeRepoSegment(repo) || !isSafeRepoSegment(commitSha)) {
    return jsonResponse(
      { error: 'INVALID_REQUEST', message: 'Valid owner, repo, and commitSha are required' },
      400
    )
  }

  const config = await readRemoteConfig(env.KV)
  if (config.feature_flags.maintenance_mode === true) {
    return maintenanceModeResponse(config)
  }

  const authHeader = request.headers.get('Authorization') ?? ''
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i)
  const token = bearerMatch?.[1]?.trim()

  const { isPro, userId } = token
    ? await verifySupabaseUser(token, env)
    : { isPro: false, userId: null }

  if (isPro && userId) {
    const proQuota = await checkAndIncrementQuota(`pro:${userId}`, true, env.KV, {
      proLimit: config.pro_daily_limit
    })
    if (!proQuota.allowed) {
      return jsonResponse({ error: 'QUOTA_EXCEEDED', message: 'Daily Pro limit reached' }, 429)
    }
  } else {
    const freeIdentifier = userId
      ? `free:${userId}`
      : await deriveAnonymousIdentifier(request)
    const freeQuota = await checkAndIncrementQuota(freeIdentifier, false, env.KV, {
      freeLimit: config.free_daily_limit
    })
    if (!freeQuota.allowed) {
      return jsonResponse({ error: 'QUOTA_EXCEEDED', message: 'Daily free limit reached' }, 429)
    }

    if (!userId) {
      const ipIdentifier = await deriveIpCeilingIdentifier(request)
      const ipQuota = await checkAndIncrementQuota(ipIdentifier, false, env.KV, {
        freeLimit: DEFAULT_IP_DAILY_CEILING
      })
      if (!ipQuota.allowed) {
        return jsonResponse({ error: 'QUOTA_EXCEEDED', message: 'Daily free limit reached' }, 429)
      }
    }
  }

  const cached = await getCachedAnalysis(owner, repo, commitSha, env.KV)
  if (cached) {
    await setLatestCachedCommitSha(owner, repo, commitSha, env.KV)
    recordQueryLog(env, ctx, request, {
      userId,
      owner,
      repo,
      isPro,
      cacheHit: true,
      provider: null,
      actionType: 'analysis',
      startedAt
    })
    return jsonResponse(buildAnalyzeResponsePayload(cached, isPro, config), 200)
  }

  const dbCached = await tryReadRepoAnalysisFromSupabase(owner, repo, commitSha, env)
  if (dbCached) {
    await Promise.all([
      setCachedAnalysis(owner, repo, commitSha, dbCached, env.KV),
      setLatestCachedCommitSha(owner, repo, commitSha, env.KV)
    ])
    recordQueryLog(env, ctx, request, {
      userId,
      owner,
      repo,
      isPro,
      cacheHit: true,
      provider: null,
      actionType: 'analysis',
      startedAt
    })
    return jsonResponse(buildAnalyzeResponsePayload(dbCached, isPro, config), 200)
  }

  const { readme, manifests } = await ingestRepositoryContext(owner, repo, commitSha)
  if (!readme.trim() && Object.keys(manifests).length === 0) {
    return jsonResponse(
      {
        error: 'REPOSITORY_NOT_ACCESSIBLE',
        message: 'Public repository README not accessible'
      },
      404
    )
  }

  const [systemPromptRaw, priorityOrder, apiKeysConfig] = await Promise.all([
    env.KV.get('system_prompt_repo'),
    readProviderPriority(env.KV),
    readProviderApiKeys(env.KV)
  ])

  const analyze = env.analyzeRepo ?? generateRepoAnalysis

  try {
    const analysis = await analyze(
      { owner, repo, commitSha, readme, manifests },
      {
        geminiApiKey: env.GEMINI_API_KEY,
        groqApiKey: env.GROQ_API_KEY,
        cfAiBinding: env.AI,
        openRouterApiKey: env.OPENROUTER_API_KEY,
        systemPrompt: systemPromptRaw ?? undefined,
        priorityOrder,
        apiKeysPool: apiKeysConfig.keys,
        keyRotationStrategy: apiKeysConfig.strategy
      }
    )

    await Promise.all([
      setCachedAnalysis(owner, repo, commitSha, analysis, env.KV),
      setLatestCachedCommitSha(owner, repo, commitSha, env.KV)
    ])
    persistRepoAnalysis(env, ctx, owner, repo, commitSha, analysis)
    recordQueryLog(env, ctx, request, {
      userId,
      owner,
      repo,
      isPro,
      cacheHit: false,
      provider: analysis.providerUsed,
      actionType: 'analysis',
      startedAt
    })
    return jsonResponse(buildAnalyzeResponsePayload(analysis, isPro, config), 200)
  } catch (error) {
    const code = (error as { code?: string })?.code
    if (error instanceof AIProvidersExhaustedError || code === 'AI_PROVIDERS_EXHAUSTED') {
      return jsonResponse(
        {
          error: 'AI_PROVIDERS_EXHAUSTED',
          message: 'All AI providers temporarily unavailable. Please retry shortly.'
        },
        503
      )
    }

    return jsonResponse(
      { error: 'INTERNAL_ERROR', message: 'Failed to analyze repository' },
      500
    )
  }
}

async function handleWebhookRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const signature = request.headers.get('X-Signature') ?? ''
  const secret = env.LEMON_SQUEEZY_WEBHOOK_SECRET ?? ''
  const rawBody = await request.text()

  try {
    const supabase = createRestSupabaseClient(env)
    const result = await handleLemonSqueezyWebhook(
      rawBody,
      signature,
      secret,
      supabase,
      rawBody
    )
    return jsonResponse(result, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_WEBHOOK_SIGNATURE') {
      return jsonResponse(
        { error: 'INVALID_WEBHOOK_SIGNATURE', message: 'Invalid webhook signature' },
        401
      )
    }
    if (error instanceof Error && error.message === 'INVALID_WEBHOOK_JSON') {
      return jsonResponse({ error: 'INVALID_REQUEST', message: 'Invalid webhook JSON' }, 400)
    }
    return jsonResponse(
      { error: 'WEBHOOK_PROCESSING_FAILED', message: 'Failed to process webhook' },
      500
    )
  }
}

async function resolveMascotCachedAnalysis(
  owner: string,
  repo: string,
  requestedSha: string | undefined,
  kv: KVNamespace
): Promise<{ commitSha?: string; cached: AnalysisResult | null }> {
  if (requestedSha && requestedSha !== 'HEAD') {
    const cached = await getCachedAnalysis(owner, repo, requestedSha, kv)
    return { commitSha: requestedSha, cached }
  }

  const latestSha = await getLatestCachedCommitSha(owner, repo, kv)
  if (latestSha && isSafeRepoSegment(latestSha)) {
    const cachedLatest = await getCachedAnalysis(owner, repo, latestSha, kv)
    if (cachedLatest) {
      return { commitSha: latestSha, cached: cachedLatest }
    }
  }

  if (requestedSha === 'HEAD') {
    const cachedHead = await getCachedAnalysis(owner, repo, 'HEAD', kv)
    return { commitSha: latestSha && isSafeRepoSegment(latestSha) ? latestSha : 'HEAD', cached: cachedHead }
  }

  return {
    ...(latestSha && isSafeRepoSegment(latestSha) ? { commitSha: latestSha } : {}),
    cached: null
  }
}

async function handleMascotChat(
  request: Request,
  env: WorkerEnv,
  ctx?: WorkerExecutionContext
): Promise<Response> {
  const startedAt = Date.now()
  const config = await readRemoteConfig(env.KV)
  if (config.feature_flags.maintenance_mode === true) {
    return maintenanceModeResponse(config)
  }

  const authHeader = request.headers.get('Authorization') ?? ''
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i)
  const token = bearerMatch?.[1]?.trim()

  const { isPro, userId } = token
    ? await verifySupabaseUser(token, env)
    : { isPro: false, userId: null }

  const mascotAccess = config.analysis_modules?.mascotChat ?? 'pro'
  if (mascotAccess === 'disabled' || config.feature_flags.mascot_enabled === false) {
    return jsonResponse(
      { error: 'MASCOT_DISABLED', message: 'Mascot chat is currently disabled' },
      403
    )
  }

  if (mascotAccess === 'pro' && (!userId || !isPro)) {
    return jsonResponse(
      { error: 'PRO_REQUIRED', message: 'Mascot chat requires an active Pro subscription' },
      403
    )
  }

  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return jsonResponse({ error: 'INVALID_REQUEST', message: 'JSON object body required' }, 400)
    }
    body = parsed as Record<string, unknown>
  } catch {
    return jsonResponse({ error: 'INVALID_REQUEST', message: 'Invalid JSON body' }, 400)
  }

  const rawRepoContext =
    body.repoContext && typeof body.repoContext === 'object' && !Array.isArray(body.repoContext)
      ? (body.repoContext as Record<string, unknown>)
      : {}
  const owner = rawRepoContext.owner
  const repo = rawRepoContext.repo
  const commitShaRaw = rawRepoContext.commitSha ?? rawRepoContext.commit_sha

  if (!isSafeRepoSegment(owner) || !isSafeRepoSegment(repo)) {
    return jsonResponse(
      { error: 'INVALID_REQUEST', message: 'Valid repoContext.owner and repoContext.repo are required' },
      400
    )
  }

  const requestedSha = isSafeRepoSegment(commitShaRaw) ? commitShaRaw : undefined
  const messages = body.messages as MascotChatMessage[]

  const [systemPromptRaw, priorityOrder, resolvedCache, apiKeysConfig] = await Promise.all([
    env.KV.get('system_prompt_mascot'),
    readProviderPriority(env.KV),
    resolveMascotCachedAnalysis(owner, repo, requestedSha, env.KV),
    readProviderApiKeys(env.KV)
  ])

  let selectedProvider: ProviderName | null = null

  try {
    const stream = await handleMascotChatRequest(
      {
        userId,
        messages,
        repoContext: {
          owner,
          repo,
          ...(resolvedCache.commitSha ? { commitSha: resolvedCache.commitSha } : {}),
          ...(resolvedCache.cached?.summary ? { summary: resolvedCache.cached.summary } : {})
        }
      },
      env.KV,
      {
        proLimit: config.pro_daily_limit,
        systemPrompt: systemPromptRaw ?? undefined,
        priorityOrder,
        geminiApiKey: env.GEMINI_API_KEY,
        groqApiKey: env.GROQ_API_KEY,
        cfAiBinding: env.AI,
        openRouterApiKey: env.OPENROUTER_API_KEY,
        apiKeysPool: apiKeysConfig.keys,
        keyRotationStrategy: apiKeysConfig.strategy,
        chatProviders: env.chatProviders,
        onProviderSelected: (provider) => {
          selectedProvider = provider
        }
      }
    )

    recordQueryLog(env, ctx, request, {
      userId,
      owner,
      repo,
      isPro: true,
      cacheHit: false,
      provider: selectedProvider,
      actionType: 'mascot_chat',
      startedAt
    })

    return new Response(stream, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      }
    })
  } catch (error) {
    if (error instanceof InvalidMascotRequestError) {
      return jsonResponse({ error: 'INVALID_REQUEST', message: error.message }, 400)
    }

    if (error instanceof Error && error.message === 'PRO_QUOTA_EXHAUSTED') {
      return jsonResponse(
        {
          error: 'QUOTA_EXCEEDED',
          code: 'PRO_QUOTA_EXHAUSTED',
          message: 'Daily Pro limit reached'
        },
        429
      )
    }

    const code = (error as { code?: string })?.code
    if (error instanceof AIProvidersExhaustedError || code === 'AI_PROVIDERS_EXHAUSTED') {
      return jsonResponse(
        {
          error: 'AI_PROVIDERS_EXHAUSTED',
          message: 'All AI providers temporarily unavailable. Please retry shortly.'
        },
        503
      )
    }

    return jsonResponse(
      { error: 'INTERNAL_ERROR', message: 'Failed to process mascot chat' },
      500
    )
  }
}

export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
    ctx?: WorkerExecutionContext
  ): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    try {
      const url = new URL(request.url)

      if (request.method === 'GET' && url.pathname === '/v1/config') {
        const config = await readRemoteConfig(env.KV)
        return jsonResponse(config, 200)
      }

      if (request.method === 'POST' && url.pathname === '/v1/analyze') {
        return await handleAnalyze(request, env, ctx)
      }

      if (request.method === 'POST' && url.pathname === '/v1/webhooks/lemonsqueezy') {
        return await handleWebhookRequest(request, env)
      }

      if (request.method === 'POST' && url.pathname === '/v1/mascot/chat') {
        return await handleMascotChat(request, env, ctx)
      }

      return jsonResponse({ error: 'NOT_FOUND', message: 'Route not found' }, 404)
    } catch {
      return jsonResponse(
        { error: 'INTERNAL_ERROR', message: 'Internal server error' },
        500
      )
    }
  }
}
