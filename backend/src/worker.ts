import { generateRepoAnalysis } from './ai/router'
import {
  AIProvidersExhaustedError,
  type KVNamespace,
  type ProviderName
} from './ai/types'
import { getCachedAnalysis, setCachedAnalysis } from './cache/repo-cache'
import { checkAndIncrementQuota, deriveAnonymousIdentifier } from './middleware/rate-limiter'
import { filterResponseForRole } from './middleware/role-filter'
import {
  handleLemonSqueezyWebhook,
  type SupabaseClientLike,
  type SupabaseQueryResult
} from './webhooks/lemonsqueezy'

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

async function deriveIpCeilingIdentifier(request: Request): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP')?.trim() || '0.0.0.0'
  const payload = new TextEncoder().encode(ip)
  const digest = await crypto.subtle.digest('SHA-256', payload)
  const hexHash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return `ip:${hexHash}`
}

async function verifySupabaseUser(
  token: string,
  env: WorkerEnv
): Promise<{ isPro: boolean; userId: string | null }> {
  if (env.verifyProUser) {
    return env.verifyProUser(token, env)
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
  const [freeRaw, proRaw, flagsRaw] = await Promise.all([
    kv.get('free_daily_limit'),
    kv.get('pro_daily_limit'),
    kv.get('feature_flags')
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

  return {
    free_daily_limit: parsePositiveInteger(freeRaw, DEFAULT_FREE_DAILY_LIMIT),
    pro_daily_limit: parsePositiveInteger(proRaw, DEFAULT_PRO_DAILY_LIMIT),
    feature_flags: {
      ...defaults,
      ...parsedFlags
    }
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

async function handleAnalyze(request: Request, env: WorkerEnv): Promise<Response> {
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

  const authHeader = request.headers.get('Authorization') ?? ''
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i)
  const token = bearerMatch?.[1]?.trim()

  const { isPro, userId } = token
    ? await verifySupabaseUser(token, env)
    : { isPro: false, userId: null }

  const config = await readRemoteConfig(env.KV)

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
    return jsonResponse(filterResponseForRole(cached, isPro), 200)
  }

  const { readme, manifests } = await ingestRepositoryContext(owner, repo, commitSha)
  if (!readme && Object.keys(manifests).length === 0) {
    return jsonResponse(
      {
        error: 'REPOSITORY_NOT_ACCESSIBLE',
        message: 'Public repository README not accessible'
      },
      404
    )
  }

  const [systemPromptRaw, priorityOrder] = await Promise.all([
    env.KV.get('system_prompt_repo'),
    readProviderPriority(env.KV)
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
        priorityOrder
      }
    )

    await setCachedAnalysis(owner, repo, commitSha, analysis, env.KV)
    return jsonResponse(filterResponseForRole(analysis, isPro), 200)
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

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return jsonResponse({ error: 'INVALID_REQUEST', message: 'Invalid webhook JSON' }, 400)
  }

  try {
    const supabase = createRestSupabaseClient(env)
    const result = await handleLemonSqueezyWebhook(
      payload as Record<string, unknown>,
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
    return jsonResponse(
      { error: 'WEBHOOK_PROCESSING_FAILED', message: 'Failed to process webhook' },
      500
    )
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/v1/config') {
      const config = await readRemoteConfig(env.KV)
      return jsonResponse(config, 200)
    }

    if (request.method === 'POST' && url.pathname === '/v1/analyze') {
      return handleAnalyze(request, env)
    }

    if (request.method === 'POST' && url.pathname === '/v1/webhooks/lemonsqueezy') {
      return handleWebhookRequest(request, env)
    }

    if (request.method === 'POST' && url.pathname === '/v1/mascot/chat') {
      return jsonResponse(
        { error: 'NOT_IMPLEMENTED', message: 'Mascot chat endpoint wired in Task 6' },
        501
      )
    }

    return jsonResponse({ error: 'NOT_FOUND', message: 'Route not found' }, 404)
  }
}
