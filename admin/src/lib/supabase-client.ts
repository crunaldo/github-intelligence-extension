import type {
  KVSyncResult,
  SupabaseFilterBuilder,
  SupabaseLike,
  SupabaseMutationResult,
  SupabaseQueryResult
} from './kv-sync'
import type {
  ProfileRow,
  QueryLogRow,
  RemoteConfigRow,
  RepoAnalysisRow,
  SubscriptionRow
} from './admin-types'

export interface AdminSession {
  accessToken: string
  userId: string
  email: string
}

export interface AdminSupabaseConfig {
  supabaseUrl: string
  supabaseAnonKey: string
  accessToken?: string
}

export interface SupabaseDataResult<T> {
  data: T
  error: string | null
}

const SESSION_STORAGE_KEY = 'gpi_admin_session'
const PKCE_VERIFIER_STORAGE_KEY = 'gpi_admin_pkce_verifier'

function readStaticEnv(getter: () => string | undefined): string | undefined {
  try {
    const value = getter()
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
  } catch {
    return undefined
  }
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return ''
}

export function getPublicSupabaseConfig(): AdminSupabaseConfig {
  const globalEnv =
    typeof window !== 'undefined'
      ? (window as unknown as { __ADMIN_ENV__?: Record<string, string | undefined> }).__ADMIN_ENV__
      : undefined

  return {
    supabaseUrl: firstNonEmpty(
      globalEnv?.NEXT_PUBLIC_SUPABASE_URL,
      globalEnv?.VITE_SUPABASE_URL,
      globalEnv?.SUPABASE_URL,
      readStaticEnv(() => process.env.NEXT_PUBLIC_SUPABASE_URL),
      readStaticEnv(() => process.env.VITE_SUPABASE_URL),
      readStaticEnv(() => process.env.SUPABASE_URL),
      readStaticEnv(() => import.meta.env?.VITE_SUPABASE_URL)
    ),
    supabaseAnonKey: firstNonEmpty(
      globalEnv?.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      globalEnv?.VITE_SUPABASE_ANON_KEY,
      globalEnv?.SUPABASE_ANON_KEY,
      readStaticEnv(() => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      readStaticEnv(() => process.env.VITE_SUPABASE_ANON_KEY),
      readStaticEnv(() => process.env.SUPABASE_ANON_KEY),
      readStaticEnv(() => import.meta.env?.VITE_SUPABASE_ANON_KEY)
    )
  }
}

export function getStoredAdminSession(): AdminSession | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null
  }
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AdminSession>
    if (
      typeof parsed.accessToken === 'string' &&
      parsed.accessToken.length > 0 &&
      typeof parsed.userId === 'string' &&
      parsed.userId.length > 0
    ) {
      return {
        accessToken: parsed.accessToken,
        userId: parsed.userId,
        email: typeof parsed.email === 'string' ? parsed.email : ''
      }
    }
    return null
  } catch {
    return null
  }
}

export function storeAdminSession(session: AdminSession | null): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  if (!session) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

export interface OAuthCallbackParams {
  accessToken: string | null
  code: string | null
  error: string | null
}

export function parseOAuthCallbackFromUrl(): OAuthCallbackParams {
  if (typeof window === 'undefined') {
    return { accessToken: null, code: null, error: null }
  }

  const searchParams = new URLSearchParams(window.location.search || '')
  const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''))

  const errorDescription =
    searchParams.get('error_description') || hashParams.get('error_description')
  const errorCode = searchParams.get('error') || hashParams.get('error')
  const error = errorDescription || errorCode || null

  const code = searchParams.get('code') || hashParams.get('code') || null
  const accessToken =
    hashParams.get('access_token') || searchParams.get('access_token') || null

  return { accessToken, code, error }
}

export function parseSessionFromUrlHash(): AdminSession | null {
  const { accessToken } = parseOAuthCallbackFromUrl()
  if (!accessToken) return null

  return {
    accessToken,
    userId: '',
    email: ''
  }
}

export interface AuthUserSummary {
  id: string
  email: string
  providerId?: string
  userName?: string
}

export async function fetchAuthUser(
  accessToken: string,
  config = getPublicSupabaseConfig()
): Promise<AuthUserSummary | null> {
  if (!config.supabaseUrl || !config.supabaseAnonKey || !accessToken) {
    return null
  }

  try {
    const baseUrl = config.supabaseUrl.replace(/\/+$/, '')
    const res = await fetch(`${baseUrl}/auth/v1/user`, {
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`
      }
    })
    if (!res.ok) {
      return null
    }
    const data = (await res.json()) as {
      id?: string
      email?: string
      user_metadata?: {
        email?: string
        user_name?: string
        preferred_username?: string
        provider_id?: string | number
      }
    }
    if (!data?.id) {
      return null
    }
    const meta = data.user_metadata
    const resolvedEmail =
      data.email ||
      (typeof meta?.email === 'string' && meta.email ? meta.email : '') ||
      (typeof meta?.user_name === 'string' && meta.user_name ? meta.user_name : '') ||
      (typeof meta?.preferred_username === 'string' && meta.preferred_username ? meta.preferred_username : '') ||
      ''
    return {
      id: data.id,
      email: resolvedEmail,
      providerId: meta?.provider_id !== undefined ? String(meta.provider_id) : undefined,
      userName: meta?.user_name || meta?.preferred_username
    }
  } catch {
    return null
  }
}

/**
 * Resolves an OAuth callback from URL (either PKCE query param `code` or implicit hash `access_token`),
 * fetches the authenticated user profile, and persists the session.
 */
export async function resolveOAuthSessionFromUrl(
  config = getPublicSupabaseConfig()
): Promise<{ session: AdminSession | null; error?: string }> {
  const { accessToken, code, error } = parseOAuthCallbackFromUrl()
  if (error) {
    return { session: null, error }
  }
  if (code) {
    return exchangeAdminPkceCode(code, config)
  }
  if (accessToken) {
    const user = await fetchAuthUser(accessToken, config)
    if (!user) {
      return { session: null, error: 'No se pudo verificar la identidad del usuario desde Supabase.' }
    }
    const session: AdminSession = {
      accessToken,
      userId: user.id,
      email: user.email
    }
    storeAdminSession(session)
    return { session }
  }
  return { session: null }
}

export async function signInWithEmailPassword(
  email: string,
  password: string,
  config = getPublicSupabaseConfig()
): Promise<{ session: AdminSession | null; error?: string }> {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    return { session: null, error: 'Supabase environment variables are not configured' }
  }

  try {
    const baseUrl = config.supabaseUrl.replace(/\/+$/, '')
    const res = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.supabaseAnonKey
      },
      body: JSON.stringify({ email, password })
    })

    if (!res.ok) {
      const errText = await res.text()
      return { session: null, error: errText || `Sign-in failed (${res.status})` }
    }

    const payload = (await res.json()) as {
      access_token?: string
      user?: { id?: string; email?: string }
    }

    if (!payload.access_token || !payload.user?.id) {
      return { session: null, error: 'Invalid auth response from Supabase' }
    }

    const session: AdminSession = {
      accessToken: payload.access_token,
      userId: payload.user.id,
      email: payload.user.email ?? email
    }
    storeAdminSession(session)
    return { session }
  } catch (error) {
    return {
      session: null,
      error: error instanceof Error ? error.message : 'Network error signing in'
    }
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0)
  }
  const base64 =
    typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64')
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function generatePkceVerifier(): string {
  const bytes = new Uint8Array(32)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  return toBase64Url(bytes)
}

async function createPkceChallenge(
  verifier: string
): Promise<{ challenge: string; method: 's256' | 'plain' }> {
  const subtle = globalThis.crypto?.subtle
  if (subtle && typeof subtle.digest === 'function') {
    const encoded = new TextEncoder().encode(verifier)
    const digest = await subtle.digest('SHA-256', encoded)
    return { challenge: toBase64Url(new Uint8Array(digest)), method: 's256' }
  }
  return { challenge: verifier, method: 'plain' }
}

export async function exchangeAdminPkceCode(
  code: string,
  config = getPublicSupabaseConfig()
): Promise<{ session: AdminSession | null; error?: string }> {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    return { session: null, error: 'Supabase environment variables are not configured' }
  }

  let codeVerifier: string | null = null
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      codeVerifier = window.sessionStorage.getItem(PKCE_VERIFIER_STORAGE_KEY)
      window.sessionStorage.removeItem(PKCE_VERIFIER_STORAGE_KEY)
    }
  } catch {
    codeVerifier = null
  }

  try {
    const baseUrl = config.supabaseUrl.replace(/\/+$/, '')
    const res = await fetch(`${baseUrl}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.supabaseAnonKey
      },
      body: JSON.stringify({
        auth_code: code,
        ...(codeVerifier ? { code_verifier: codeVerifier } : {})
      })
    })

    if (!res.ok) {
      const errText = await res.text()
      return { session: null, error: errText || `OAuth PKCE exchange failed (${res.status})` }
    }

    const payload = (await res.json()) as {
      access_token?: string
      user?: { id?: string; email?: string }
    }

    if (!payload.access_token) {
      return { session: null, error: 'Supabase PKCE response missing access_token' }
    }

    const resolvedUser = payload.user?.id
      ? { id: payload.user.id, email: payload.user.email ?? '' }
      : await fetchAuthUser(payload.access_token, config)

    if (!resolvedUser) {
      return { session: null, error: 'Unable to load authenticated user after OAuth callback' }
    }

    const session: AdminSession = {
      accessToken: payload.access_token,
      userId: resolvedUser.id,
      email: resolvedUser.email
    }
    storeAdminSession(session)
    return { session }
  } catch (error) {
    return {
      session: null,
      error: error instanceof Error ? error.message : 'Network error completing GitHub OAuth'
    }
  }
}

export async function startGitHubOAuthSignIn(
  config = getPublicSupabaseConfig()
): Promise<{ ok: boolean; error?: string }> {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    return {
      ok: false,
      error: 'Supabase environment variables are not configured (missing SUPABASE_URL or SUPABASE_ANON_KEY).'
    }
  }
  if (typeof window === 'undefined') {
    return { ok: false, error: 'GitHub OAuth sign-in is only available in the browser.' }
  }

  const baseUrl = config.supabaseUrl.replace(/\/+$/, '')
  const currentUrl = window.location.href.split('#')[0]?.split('?')[0] ?? window.location.origin
  const verifier = generatePkceVerifier()
  const { challenge, method } = await createPkceChallenge(verifier)

  try {
    window.sessionStorage?.setItem(PKCE_VERIFIER_STORAGE_KEY, verifier)
  } catch {
    // Ignore sessionStorage restrictions
  }

  const authUrl = new URL(`${baseUrl}/auth/v1/authorize`)
  authUrl.searchParams.set('provider', 'github')
  authUrl.searchParams.set('redirect_to', currentUrl)
  authUrl.searchParams.set('code_challenge', challenge)
  authUrl.searchParams.set('code_challenge_method', method)

  window.location.assign(authUrl.toString())
  return { ok: true }
}

export interface ExtendedFilterBuilder<T = Record<string, unknown>> extends SupabaseFilterBuilder<T> {
  eq(column: string, value: unknown): ExtendedFilterBuilder<T>
  ilike(column: string, pattern: string): ExtendedFilterBuilder<T>
  or(expression: string): ExtendedFilterBuilder<T>
  order(column: string, options?: { ascending?: boolean }): ExtendedFilterBuilder<T>
  limit(count: number): ExtendedFilterBuilder<T>
}

export interface AdminSupabaseTableBuilder {
  upsert(values: unknown, options?: { onConflict?: string }): Promise<SupabaseMutationResult>
  select(columns?: string): ExtendedFilterBuilder
  update(values: Record<string, unknown>): ExtendedFilterBuilder
  delete(): ExtendedFilterBuilder
}

export interface AdminSupabaseClient extends SupabaseLike {
  from(table: string): AdminSupabaseTableBuilder
}

export function createBrowserSupabaseClient(
  accessToken?: string,
  config = getPublicSupabaseConfig()
): AdminSupabaseClient {
  const baseUrl = config.supabaseUrl.replace(/\/+$/, '')

  const buildHeaders = (extra?: Record<string, string>): Record<string, string> => {
    const headers: Record<string, string> = {
      apikey: config.supabaseAnonKey,
      ...extra
    }
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }
    return headers
  }

  const executeQuery = async (
    table: string,
    method: 'GET' | 'PATCH' | 'DELETE',
    filters: string[],
    options: {
      select?: string
      order?: string
      limit?: number
      body?: unknown
      singleRow?: boolean
    }
  ): Promise<SupabaseQueryResult<Record<string, unknown>>> => {
    if (!baseUrl || !config.supabaseAnonKey) {
      return { data: null, error: { message: 'Supabase configuration missing' } }
    }

    try {
      const params = [...filters]
      if (options.select !== undefined) {
        params.push(`select=${encodeURIComponent(options.select)}`)
      }
      if (options.order) {
        params.push(`order=${encodeURIComponent(options.order)}`)
      }
      if (typeof options.limit === 'number') {
        params.push(`limit=${options.limit}`)
      }

      const queryString = params.length > 0 ? `?${params.join('&')}` : ''
      const res = await fetch(`${baseUrl}/rest/v1/${table}${queryString}`, {
        method,
        headers: buildHeaders(
          method === 'PATCH'
            ? { 'Content-Type': 'application/json', Prefer: 'return=minimal' }
            : undefined
        ),
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined
      })

      if (!res.ok) {
        const msg = await res.text()
        return { data: null, error: { message: msg || `HTTP ${res.status}` } }
      }

      if (method !== 'GET') {
        return { data: null, error: null }
      }

      const rows = (await res.json()) as Array<Record<string, unknown>>
      if (options.singleRow) {
        return { data: rows[0] ?? null, error: null }
      }
      return { data: rows, error: null }
    } catch (error) {
      return {
        data: null,
        error: { message: error instanceof Error ? error.message : 'Network error querying Supabase' }
      }
    }
  }

  const createFilterBuilder = (
    table: string,
    method: 'GET' | 'PATCH' | 'DELETE',
    initial: { select?: string; body?: unknown }
  ): ExtendedFilterBuilder => {
    const filters: string[] = []
    let orderClause: string | undefined
    let limitCount: number | undefined

    const run = (singleRow = false) =>
      executeQuery(table, method, filters, {
        select: initial.select,
        order: orderClause,
        limit: limitCount,
        body: initial.body,
        singleRow
      })

    const builder: ExtendedFilterBuilder = {
      eq(column: string, value: unknown) {
        filters.push(`${encodeURIComponent(column)}=eq.${encodeURIComponent(String(value))}`)
        return builder
      },
      ilike(column: string, pattern: string) {
        filters.push(`${encodeURIComponent(column)}=ilike.${encodeURIComponent(pattern)}`)
        return builder
      },
      or(expression: string) {
        filters.push(`or=(${encodeURIComponent(expression)})`)
        return builder
      },
      order(column: string, options?: { ascending?: boolean }) {
        orderClause = `${column}.${options?.ascending === false ? 'desc' : 'asc'}`
        return builder
      },
      limit(count: number) {
        limitCount = count
        return builder
      },
      maybeSingle() {
        limitCount = 1
        return run(true)
      },
      single() {
        limitCount = 1
        return run(true)
      },
      then(onfulfilled, onrejected) {
        return run(false).then(onfulfilled, onrejected)
      }
    }

    return builder
  }

  return {
    from(table: string) {
      return {
        select(columns = '*') {
          return createFilterBuilder(table, 'GET', { select: columns })
        },
        update(values: Record<string, unknown>) {
          return createFilterBuilder(table, 'PATCH', { body: values })
        },
        delete() {
          return createFilterBuilder(table, 'DELETE', {})
        },
        async upsert(values: unknown, options?: { onConflict?: string }) {
          if (!baseUrl || !config.supabaseAnonKey) {
            return { error: { message: 'Supabase configuration missing' } }
          }
          try {
            const conflictQuery = options?.onConflict
              ? `?on_conflict=${encodeURIComponent(options.onConflict)}`
              : ''
            const res = await fetch(`${baseUrl}/rest/v1/${table}${conflictQuery}`, {
              method: 'POST',
              headers: buildHeaders({
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates,return=minimal'
              }),
              body: JSON.stringify(values)
            })
            if (!res.ok) {
              const msg = await res.text()
              return { error: { message: msg || `HTTP ${res.status}` } }
            }
            return { error: null }
          } catch (error) {
            return {
              error: { message: error instanceof Error ? error.message : 'Network error saving to Supabase' }
            }
          }
        }
      }
    }
  }
}

export async function fetchRemoteConfigsMap(
  client: AdminSupabaseClient
): Promise<SupabaseDataResult<Record<string, unknown>>> {
  const { data, error } = await client.from('remote_configs').select('key,value,updated_at')
  if (error) {
    return {
      data: {},
      error: error.message || 'Failed to load remote_configs'
    }
  }
  if (!Array.isArray(data)) {
    return { data: {}, error: null }
  }
  const map: Record<string, unknown> = {}
  for (const row of data as unknown as RemoteConfigRow[]) {
    if (row.key) {
      map[row.key] = row.value
    }
  }
  return { data: map, error: null }
}

export async function fetchRecentQueryLogs(
  client: AdminSupabaseClient,
  limit = 500
): Promise<SupabaseDataResult<QueryLogRow[]>> {
  const { data, error } = await client
    .from('query_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    return {
      data: [],
      error: error.message || 'Failed to load query_logs'
    }
  }
  return {
    data: Array.isArray(data) ? (data as unknown as QueryLogRow[]) : [],
    error: null
  }
}

export async function fetchProfiles(
  client: AdminSupabaseClient,
  search = ''
): Promise<SupabaseDataResult<ProfileRow[]>> {
  let query = client.from('profiles').select('*').order('created_at', { ascending: false }).limit(50)
  const trimmed = search.trim()
  if (trimmed) {
    if (/^[0-9a-f-]{36}$/i.test(trimmed)) {
      query = query.or(`email.ilike.*${trimmed}*,id.eq.${trimmed}`)
    } else {
      query = query.ilike('email', `*${trimmed}*`)
    }
  }
  const { data, error } = await query
  if (error) {
    return {
      data: [],
      error: error.message || 'Failed to load profiles'
    }
  }
  return {
    data: Array.isArray(data) ? (data as unknown as ProfileRow[]) : [],
    error: null
  }
}

export async function fetchSubscriptions(
  client: AdminSupabaseClient,
  userId?: string
): Promise<SupabaseDataResult<SubscriptionRow[]>> {
  let query = client
    .from('subscriptions')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(50)
  if (userId) {
    query = query.eq('user_id', userId)
  }
  const { data, error } = await query
  if (error) {
    return {
      data: [],
      error: error.message || 'Failed to load subscriptions'
    }
  }
  return {
    data: Array.isArray(data) ? (data as unknown as SubscriptionRow[]) : [],
    error: null
  }
}

export async function fetchRepoAnalyses(
  client: AdminSupabaseClient,
  repoQuery = ''
): Promise<SupabaseDataResult<RepoAnalysisRow[]>> {
  let query = client
    .from('repo_analyses')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  if (repoQuery.trim()) {
    query = query.ilike('repo_full_name', `*${repoQuery.trim()}*`)
  }
  const { data, error } = await query
  if (error) {
    return {
      data: [],
      error: error.message || 'Failed to load repo_analyses'
    }
  }
  const rawRows = Array.isArray(data) ? (data as unknown as RepoAnalysisRow[]) : []
  const seen = new Set<string>()
  const deduplicated: RepoAnalysisRow[] = []
  for (const row of rawRows) {
    const key = (row.repo_full_name || '').toLowerCase().trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    deduplicated.push(row)
  }
  return {
    data: deduplicated,
    error: null
  }
}

/**
 * Calls the server-side Admin Pages Function / API endpoint so Cloudflare KV API tokens
 * never leave the server environment.
 */
export async function dispatchServerConfigSync(
  key: string,
  value: unknown,
  accessToken?: string
): Promise<KVSyncResult> {
  try {
    const res = await fetch('/api/admin/kv-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify({ key, value })
    })
    const body = (await res.json().catch(() => null)) as KVSyncResult | null
    if (!res.ok) {
      return {
        success: false,
        error: body?.error || `Sync failed (${res.status})`
      }
    }
    return body ?? { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error syncing configuration'
    }
  }
}

/**
 * Calls the server-side Admin Pages Function / API endpoint to purge both Supabase and KV cache.
 */
export async function dispatchServerCachePurge(
  repoFullName: string,
  commitSha: string,
  accessToken?: string
): Promise<KVSyncResult> {
  try {
    const res = await fetch('/api/admin/cache-purge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify({ repoFullName, commitSha })
    })
    const body = (await res.json().catch(() => null)) as KVSyncResult | null
    if (!res.ok) {
      return {
        success: false,
        error: body?.error || `Cache purge failed (${res.status})`
      }
    }
    return body ?? { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error purging cache'
    }
  }
}
