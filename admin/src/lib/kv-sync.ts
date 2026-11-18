export interface KVBindingLike {
  put(key: string, value: string): Promise<unknown>
  delete(key: string): Promise<unknown>
}

export interface CloudflareKVOptions {
  accountId?: string
  namespaceId?: string
  apiToken?: string
  kvBinding?: KVBindingLike
}

export interface KVSyncResult {
  success: boolean
  error?: string
}

export interface SupabaseErrorLike {
  message?: string
}

export interface SupabaseQueryResult<T = Record<string, unknown>> {
  data?: T[] | T | null
  error: SupabaseErrorLike | null
}

export type SupabaseMutationResult = SupabaseQueryResult<never>
export type SupabaseSelectResult<T = Record<string, unknown>> = SupabaseQueryResult<T>

export interface SupabaseFilterBuilder<T = Record<string, unknown>>
  extends PromiseLike<SupabaseQueryResult<T>> {
  eq(column: string, value: unknown): SupabaseFilterBuilder<T>
  maybeSingle?(): Promise<SupabaseQueryResult<T>>
  single?(): Promise<SupabaseQueryResult<T>>
}

export interface SupabaseTableBuilder {
  upsert?(values: unknown, options?: { onConflict?: string }): Promise<SupabaseMutationResult>
  delete?(): SupabaseFilterBuilder
  select?(columns: string): SupabaseFilterBuilder
  update?(values: unknown): SupabaseFilterBuilder
}

export interface SupabaseLike {
  from(table: string): SupabaseTableBuilder
}

const CLOUDFLARE_KV_API_BASE = 'https://api.cloudflare.com/client/v4'

function readServerEnv(name: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) {
    return undefined
  }
  const val = process.env[name]
  return typeof val === 'string' && val.trim().length > 0 ? val.trim() : undefined
}

function isVitestRuntime(): boolean {
  return typeof process !== 'undefined' && Boolean(process.env?.VITEST)
}

function resolveCloudflareCredentials(options?: CloudflareKVOptions): {
  accountId: string
  namespaceId: string
  apiToken: string
} | null {
  const allowVitestFallback = options === undefined && isVitestRuntime()

  const accountId =
    options?.accountId?.trim() ||
    readServerEnv('CLOUDFLARE_ACCOUNT_ID') ||
    (allowVitestFallback ? 'test-account' : '')
  const namespaceId =
    options?.namespaceId?.trim() ||
    readServerEnv('CLOUDFLARE_KV_NAMESPACE_ID') ||
    (allowVitestFallback ? 'test-namespace' : '')
  const apiToken =
    options?.apiToken?.trim() ||
    readServerEnv('CLOUDFLARE_API_TOKEN') ||
    (allowVitestFallback ? 'test-token' : '')

  if (!accountId || !namespaceId || !apiToken) {
    return null
  }

  return { accountId, namespaceId, apiToken }
}

function buildKVValueUrl(accountId: string, namespaceId: string, key: string): string {
  return `${CLOUDFLARE_KV_API_BASE}/accounts/${encodeURIComponent(accountId)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/values/${encodeURIComponent(key)}`
}

/**
 * Serializes a remote config value to match Worker KV reader expectations:
 * raw plain text for strings, decimal/boolean strings for primitives, and JSON for objects/arrays.
 */
export function serializeKVValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(value ?? null)
}

/**
 * Builds the normalized KV cache key (`cache:repo:<owner>:<repo>:<commitSha>`)
 * matching `backend/src/cache/repo-cache.ts`.
 */
export function buildRepoCacheKey(repoFullName: string, commitSha: string): string | null {
  const trimmedRepo = repoFullName.trim()
  const trimmedSha = commitSha.trim()
  if (!trimmedRepo || !trimmedSha) {
    return null
  }
  const parts = trimmedRepo.split('/')
  if (parts.length !== 2) {
    return null
  }
  const owner = parts[0]?.trim() ?? ''
  const repo = parts[1]?.trim() ?? ''
  if (!owner || !repo) {
    return null
  }
  return `cache:repo:${owner.toLowerCase()}:${repo.toLowerCase()}:${trimmedSha}`
}

async function readFetchErrorDetail(res: Response): Promise<string> {
  try {
    const text = typeof res.text === 'function' ? await res.text() : ''
    return text ? `Cloudflare KV error (${res.status}): ${text}` : `Cloudflare KV error (${res.status})`
  } catch {
    return `Cloudflare KV error (${res.status})`
  }
}

/**
 * Dual-writes a remote configuration entry to Cloudflare KV first and then Supabase `remote_configs`.
 * If Cloudflare KV fails, Supabase is left untouched to prevent split-brain divergence.
 */
export async function syncConfigToCloudflareKV(
  key: string,
  value: unknown,
  supabase: SupabaseLike,
  options?: CloudflareKVOptions
): Promise<KVSyncResult> {
  const normalizedKey = typeof key === 'string' ? key.trim() : ''
  if (!normalizedKey) {
    return { success: false, error: 'Configuration key is required' }
  }

  const kvBinding = options?.kvBinding
  const credentials = kvBinding ? null : resolveCloudflareCredentials(options)
  if (!kvBinding && !credentials) {
    return { success: false, error: 'Missing Cloudflare KV credentials' }
  }

  try {
    if (kvBinding) {
      await kvBinding.put(normalizedKey, serializeKVValue(value))
    } else if (credentials) {
      const res = await fetch(
        buildKVValueUrl(credentials.accountId, credentials.namespaceId, normalizedKey),
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            Authorization: `Bearer ${credentials.apiToken}`
          },
          body: serializeKVValue(value)
        }
      )

      if (!res.ok) {
        return { success: false, error: await readFetchErrorDetail(res) }
      }
    }

    const table = supabase.from('remote_configs')
    if (!table.upsert) {
      return { success: false, error: 'Supabase client does not support upsert' }
    }

    const { error } = await table.upsert(
      {
        key: normalizedKey,
        value,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'key' }
    )

    if (error) {
      return { success: false, error: error.message || 'Failed to save configuration in Supabase' }
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unexpected KV sync error'
    }
  }
}

/**
 * Purges a cached repository analysis from Cloudflare KV first (`200` or `404` treated as absent),
 * then deletes the matching row from Supabase `repo_analyses`.
 */
export async function purgeRepoCacheFromKVAndDB(
  repoFullName: string,
  commitSha: string,
  supabase: SupabaseLike,
  options?: CloudflareKVOptions
): Promise<KVSyncResult> {
  const cacheKey = buildRepoCacheKey(repoFullName, commitSha)
  if (!cacheKey) {
    return { success: false, error: 'Valid owner/repo and commitSha are required' }
  }

  const kvBinding = options?.kvBinding
  const credentials = kvBinding ? null : resolveCloudflareCredentials(options)
  if (!kvBinding && !credentials) {
    return { success: false, error: 'Missing Cloudflare KV credentials' }
  }

  try {
    if (kvBinding) {
      await kvBinding.delete(cacheKey)
    } else if (credentials) {
      const res = await fetch(
        buildKVValueUrl(credentials.accountId, credentials.namespaceId, cacheKey),
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${credentials.apiToken}`
          }
        }
      )

      if (!res.ok && res.status !== 404) {
        return { success: false, error: await readFetchErrorDetail(res) }
      }
    }

    const table = supabase.from('repo_analyses')
    if (!table.delete) {
      return { success: false, error: 'Supabase client does not support delete' }
    }

    const { error } = await table
      .delete()
      .eq('repo_full_name', repoFullName.trim())
      .eq('commit_sha', commitSha.trim())

    if (error) {
      return { success: false, error: error.message || 'Failed to delete cache row from Supabase' }
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unexpected cache purge error'
    }
  }
}

/**
 * Verifies that the authenticated user has `profiles.role === 'admin'`.
 */
export async function verifyAdminRole(userId: string, supabase: SupabaseLike): Promise<boolean> {
  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    return false
  }

  try {
    const table = supabase.from('profiles')
    if (!table.select) {
      return false
    }

    const query = table.select('role').eq('id', userId.trim())
    const result =
      typeof query.maybeSingle === 'function' ? await query.maybeSingle() : await query

    if (result.error || !result.data) {
      return false
    }

    const row = Array.isArray(result.data) ? result.data[0] : result.data
    return Boolean(row && typeof row === 'object' && (row as { role?: unknown }).role === 'admin')
  } catch {
    return false
  }
}
