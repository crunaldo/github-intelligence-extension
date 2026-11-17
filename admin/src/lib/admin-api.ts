import {
  type CloudflareKVOptions,
  purgeRepoCacheFromKVAndDB,
  syncConfigToCloudflareKV,
  verifyAdminRole
} from './kv-sync'
import { createBrowserSupabaseClient, fetchAuthUser } from './supabase-client'

export interface AdminServerEnv extends CloudflareKVOptions {
  supabaseUrl?: string
  supabaseAnonKey?: string
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

async function authorizeAdminRequest(request: Request, env?: AdminServerEnv) {
  const authHeader = request.headers.get('Authorization') ?? ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  const accessToken = match?.[1]?.trim()
  if (!accessToken) {
    return { ok: false as const, response: jsonResponse({ success: false, error: 'Unauthorized' }, 401) }
  }

  const supabaseConfig =
    env?.supabaseUrl && env?.supabaseAnonKey
      ? { supabaseUrl: env.supabaseUrl, supabaseAnonKey: env.supabaseAnonKey }
      : undefined

  const user = await fetchAuthUser(accessToken, supabaseConfig)
  if (!user) {
    return { ok: false as const, response: jsonResponse({ success: false, error: 'Invalid session' }, 401) }
  }

  const client = createBrowserSupabaseClient(accessToken, supabaseConfig)
  const isAdmin = await verifyAdminRole(user.id, client)
  if (!isAdmin) {
    return { ok: false as const, response: jsonResponse({ success: false, error: 'Forbidden' }, 403) }
  }

  return { ok: true as const, client }
}

/**
 * Server-side handler for `/api/admin/kv-sync` verifying admin JWT before dual-writing
 * configuration changes to Supabase and Cloudflare KV.
 */
export async function handleAdminKvSyncRequest(
  request: Request,
  env?: AdminServerEnv
): Promise<Response> {
  const auth = await authorizeAdminRequest(request, env)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as { key?: unknown; value?: unknown } | null
  if (!body || typeof body.key !== 'string') {
    return jsonResponse({ success: false, error: 'key and value are required' }, 400)
  }

  const result = await syncConfigToCloudflareKV(body.key, body.value, auth.client, env)
  return jsonResponse(result, result.success ? 200 : 500)
}

/**
 * Server-side handler for `/api/admin/cache-purge` verifying admin JWT before removing
 * a repository analysis from Supabase `repo_analyses` and Cloudflare KV.
 */
export async function handleAdminCachePurgeRequest(
  request: Request,
  env?: AdminServerEnv
): Promise<Response> {
  const auth = await authorizeAdminRequest(request, env)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as
    | { repoFullName?: unknown; commitSha?: unknown }
    | null
  if (!body || typeof body.repoFullName !== 'string' || typeof body.commitSha !== 'string') {
    return jsonResponse({ success: false, error: 'repoFullName and commitSha are required' }, 400)
  }

  const result = await purgeRepoCacheFromKVAndDB(
    body.repoFullName,
    body.commitSha,
    auth.client,
    env
  )
  return jsonResponse(result, result.success ? 200 : 500)
}
