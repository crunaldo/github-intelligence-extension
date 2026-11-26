import { ALL_PROVIDERS, type ProviderName } from './admin-types'
import {
  type CloudflareKVOptions,
  type KVBindingLike,
  purgeRepoCacheFromKVAndDB,
  syncConfigToCloudflareKV,
  verifyAdminRole
} from './kv-sync'
import { createBrowserSupabaseClient, fetchAuthUser } from './supabase-client'

export interface AdminServerEnv extends CloudflareKVOptions {
  supabaseUrl?: string
  supabaseAnonKey?: string
  KV?: KVBindingLike
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_KV_NAMESPACE_ID?: string
  CLOUDFLARE_API_TOKEN?: string
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

const VALID_PROVIDERS = new Set<string>(ALL_PROVIDERS)

const ALLOWED_CONFIG_KEYS = new Set<string>([
  'free_daily_limit',
  'pro_daily_limit',
  'system_prompt_repo',
  'system_prompt_mascot',
  'feature_flags',
  'provider_priority',
  'provider_api_keys',
  'analysis_modules',
  'advanced_system_settings',
  'default_new_user_tier',
  'default_user_role',
  'access_control_rules',
  'campaign_banners',
  'telegram_alerts',
  'billing_config',
  'admin_audit_logs',
  'feedback_locations',
  'extension_release',
  'in_app_notifications',
  'team_rbac',
  'cost_budget',
  'llm_pricing',
  'trends_config'
])

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function resolveSupabaseConfig(env?: AdminServerEnv) {
  const supabaseUrl = env?.supabaseUrl ?? env?.SUPABASE_URL
  const supabaseAnonKey =
    env?.supabaseAnonKey ?? env?.SUPABASE_ANON_KEY ?? env?.SUPABASE_SERVICE_ROLE_KEY

  if (supabaseUrl && supabaseAnonKey) {
    return { supabaseUrl, supabaseAnonKey }
  }
  return undefined
}

function resolveKVOptions(env?: AdminServerEnv): CloudflareKVOptions | undefined {
  if (!env) return undefined
  const kvBinding = env.kvBinding ?? env.KV
  const accountId = env.accountId ?? env.CLOUDFLARE_ACCOUNT_ID
  const namespaceId = env.namespaceId ?? env.CLOUDFLARE_KV_NAMESPACE_ID
  const apiToken = env.apiToken ?? env.CLOUDFLARE_API_TOKEN

  if (
    kvBinding === undefined &&
    accountId === undefined &&
    namespaceId === undefined &&
    apiToken === undefined
  ) {
    return undefined
  }
  return { accountId, namespaceId, apiToken, kvBinding }
}

function validateRemoteConfigEntry(key: string, value: unknown): string | null {
  if (!ALLOWED_CONFIG_KEYS.has(key)) {
    return `Unsupported configuration key: ${key}`
  }

  switch (key) {
    case 'free_daily_limit':
    case 'pro_daily_limit':
      if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        return `${key} must be a positive integer`
      }
      return null

    case 'system_prompt_repo':
    case 'system_prompt_mascot':
      if (typeof value !== 'string' || value.trim().length === 0) {
        return `${key} must be a non-empty string`
      }
      return null

    case 'feature_flags': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return 'feature_flags must be a plain JSON object'
      }
      const flags = value as Record<string, unknown>
      for (const flagKey of ['mascot_enabled', 'diagrams_enabled', 'maintenance_mode']) {
        if (flagKey in flags && typeof flags[flagKey] !== 'boolean') {
          return `feature_flags.${flagKey} must be a boolean`
        }
      }
      if ('banner_message' in flags && typeof flags.banner_message !== 'string') {
        return 'feature_flags.banner_message must be a string'
      }
      return null
    }

    case 'feedback_locations': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return 'feedback_locations must be a plain JSON object'
      }
      return null
    }

    case 'provider_priority':
      if (
        !Array.isArray(value) ||
        value.length === 0 ||
        !value.every((item): item is ProviderName => typeof item === 'string' && VALID_PROVIDERS.has(item))
      ) {
        return 'provider_priority must be a non-empty array of valid provider names'
      }
      return null

    case 'provider_api_keys': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return 'provider_api_keys must be an object with keys array and strategy'
      }
      const pool = value as Record<string, unknown>
      if (!Array.isArray(pool.keys)) {
        return 'provider_api_keys.keys must be an array'
      }
      for (const item of pool.keys) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return 'Each API key in provider_api_keys must be an object'
        }
        const k = item as Record<string, unknown>
        if (typeof k.id !== 'string' || !k.id.trim()) {
          return 'Each API key must have an id'
        }
        if (typeof k.provider !== 'string' || !VALID_PROVIDERS.has(k.provider)) {
          return `Invalid provider in API key: ${k.provider}`
        }
        if (typeof k.key !== 'string' || !k.key.trim()) {
          return 'Each API key must have a non-empty key value'
        }
      }
      return null
    }

    case 'analysis_modules': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return 'analysis_modules must be an object mapping module IDs to access tiers'
      }
      const modules = value as Record<string, unknown>
      for (const [modId, tier] of Object.entries(modules)) {
        if (tier !== 'free' && tier !== 'pro' && tier !== 'disabled') {
          return `Module ${modId} must have access level 'free', 'pro', or 'disabled'`
        }
      }
      return null
    }

    case 'advanced_system_settings': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return 'advanced_system_settings must be a JSON object'
      }
      return null
    }

    case 'default_new_user_tier':
    case 'default_user_role': {
      if (value !== 'free' && value !== 'pro') {
        return `${key} must be either 'free' or 'pro'`
      }
      return null
    }

    case 'access_control_rules': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return 'access_control_rules must be a valid JSON object'
      }
      return null
    }

    case 'campaign_banners': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return 'campaign_banners must be an object with banners array'
      }
      const cfg = value as Record<string, unknown>
      if (!Array.isArray(cfg.banners)) {
        return 'campaign_banners.banners must be an array'
      }
      return null
    }

    case 'telegram_alerts': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return 'telegram_alerts must be a JSON object'
      }
      return null
    }

    case 'billing_config': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return 'billing_config must be a JSON object'
      }
      return null
    }

    case 'admin_audit_logs': {
      if (!Array.isArray(value)) {
        return 'admin_audit_logs must be an array of audit log entries'
      }
      return null
    }

    case 'extension_release': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return 'extension_release must be a JSON object'
      }
      return null
    }

    case 'in_app_notifications': {
      if (!value || typeof value !== 'object') {
        return 'in_app_notifications must be an object or array'
      }
      return null
    }

    case 'team_rbac': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return 'team_rbac must be a JSON object'
      }
      return null
    }

    case 'cost_budget': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return 'cost_budget must be a JSON object'
      }
      return null
    }

    case 'llm_pricing': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return 'llm_pricing must be a JSON object'
      }
      return null
    }

    case 'trends_config': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return 'trends_config must be a JSON object'
      }
      return null
    }

    default:
      return `Unsupported configuration key: ${key}`
  }
}

async function authorizeAdminRequest(request: Request, env?: AdminServerEnv) {
  const authHeader = request.headers.get('Authorization') ?? ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  const accessToken = match?.[1]?.trim()
  if (!accessToken) {
    return { ok: false as const, response: jsonResponse({ success: false, error: 'Unauthorized' }, 401) }
  }

  const supabaseConfig = resolveSupabaseConfig(env)
  const user = await fetchAuthUser(accessToken, supabaseConfig)
  if (!user) {
    return { ok: false as const, response: jsonResponse({ success: false, error: 'Invalid session' }, 401) }
  }

  const client = createBrowserSupabaseClient(accessToken, supabaseConfig)
  const isAdmin = await verifyAdminRole(user.id, client, user.email)
  if (!isAdmin) {
    return { ok: false as const, response: jsonResponse({ success: false, error: 'Forbidden' }, 403) }
  }

  return { ok: true as const, client }
}

/**
 * Server-side handler for `/api/admin/kv-sync` enforcing POST, admin JWT, and config schema
 * validation before dual-writing configuration changes to Cloudflare KV and Supabase.
 */
export async function handleAdminKvSyncRequest(
  request: Request,
  env?: AdminServerEnv
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405)
  }

  const auth = await authorizeAdminRequest(request, env)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.key !== 'string') {
    return jsonResponse({ success: false, error: 'key and value are required' }, 400)
  }
  if (!('value' in body) || body.value === undefined) {
    return jsonResponse({ success: false, error: 'value is required' }, 400)
  }

  const validationError = validateRemoteConfigEntry(body.key.trim(), body.value)
  if (validationError) {
    return jsonResponse({ success: false, error: validationError }, 400)
  }

  const result = await syncConfigToCloudflareKV(
    body.key.trim(),
    body.value,
    auth.client,
    resolveKVOptions(env)
  )
  return jsonResponse(result, result.success ? 200 : 500)
}

/**
 * Server-side handler for `/api/admin/cache-purge` enforcing POST and admin JWT before removing
 * a repository analysis from Cloudflare KV and Supabase `repo_analyses`.
 */
export async function handleAdminCachePurgeRequest(
  request: Request,
  env?: AdminServerEnv
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405)
  }

  const auth = await authorizeAdminRequest(request, env)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as
    | { repoFullName?: unknown; commitSha?: unknown }
    | null
  if (
    !body ||
    typeof body.repoFullName !== 'string' ||
    !body.repoFullName.trim() ||
    typeof body.commitSha !== 'string' ||
    !body.commitSha.trim()
  ) {
    return jsonResponse({ success: false, error: 'repoFullName and commitSha are required' }, 400)
  }

  const result = await purgeRepoCacheFromKVAndDB(
    body.repoFullName,
    body.commitSha,
    auth.client,
    resolveKVOptions(env)
  )
  return jsonResponse(result, result.success ? 200 : 500)
}
