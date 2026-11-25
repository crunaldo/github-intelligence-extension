import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LOGO_VARIANTS,
  applyTheme,
  getStoredLogoVariant,
  getStoredTheme
} from '../src/lib/admin-shell'
import {
  handleAdminCachePurgeRequest,
  handleAdminKvSyncRequest
} from '../src/lib/admin-api'
import {
  KNOWN_ADMIN_EMAILS,
  purgeRepoCacheFromKVAndDB,
  syncConfigToCloudflareKV,
  verifyAdminRole
} from '../src/lib/kv-sync'
import {
  createBrowserSupabaseClient,
  dispatchServerCachePurge,
  dispatchServerConfigSync,
  exchangeAdminPkceCode,
  fetchAuthUser,
  fetchProfiles,
  fetchRecentQueryLogs,
  fetchRemoteConfigsMap,
  fetchRepoAnalyses,
  fetchSubscriptions,
  getPublicSupabaseConfig,
  parseOAuthCallbackFromUrl,
  resolveOAuthSessionFromUrl,
  startGitHubOAuthSignIn
} from '../src/lib/supabase-client'
import { POST as kvSyncRoutePost } from '../src/app/api/admin/kv-sync/route'
import { POST as cachePurgeRoutePost } from '../src/app/api/admin/cache-purge/route'
import { onRequestPost as cfKvSyncPost } from '../functions/api/admin/kv-sync'
import { onRequestPost as cfCachePurgePost } from '../functions/api/admin/cache-purge'

describe('Admin KV Sync', () => {
  const originalEnv = { ...process.env }
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
    delete process.env.CLOUDFLARE_ACCOUNT_ID
    delete process.env.CLOUDFLARE_KV_NAMESPACE_ID
    delete process.env.CLOUDFLARE_API_TOKEN
    delete process.env.VITE_CLOUDFLARE_API_TOKEN
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    global.fetch = originalFetch
  })

  it('dual writes configuration changes to Supabase and Cloudflare KV API', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null })
    }
    const res = await syncConfigToCloudflareKV('free_daily_limit', 15, mockSupabase as any)
    expect(res.success).toBe(true)
    expect(mockSupabase.from).toHaveBeenCalledWith('remote_configs')
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'free_daily_limit',
        value: 15,
        updated_at: expect.any(String)
      }),
      { onConflict: 'key' }
    )
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/values/free_daily_limit'),
      expect.objectContaining({
        method: 'PUT',
        body: '15'
      })
    )
  })

  it('writes Cloudflare KV before Supabase and skips Supabase upsert when KV fails', async () => {
    const callOrder: string[] = []
    global.fetch = vi.fn().mockImplementation(async () => {
      callOrder.push('kv_put')
      return { ok: true, status: 200 }
    })
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockImplementation(async () => {
        callOrder.push('supabase_upsert')
        return { error: null }
      })
    }

    const okRes = await syncConfigToCloudflareKV('free_daily_limit', 20, mockSupabase as any)
    expect(okRes.success).toBe(true)
    expect(callOrder).toEqual(['kv_put', 'supabase_upsert'])

    const upsertFailGuard = vi.fn().mockResolvedValue({ error: null })
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue('KV unavailable')
    })
    const failRes = await syncConfigToCloudflareKV('free_daily_limit', 20, {
      from: vi.fn().mockReturnValue({ upsert: upsertFailGuard })
    } as any)

    expect(failRes.success).toBe(false)
    expect(failRes.error).toContain('500')
    expect(upsertFailGuard).not.toHaveBeenCalled()
  })

  it('requires explicit or env Cloudflare credentials when options are provided or outside Vitest', async () => {
    global.fetch = vi.fn()
    const upsertFn = vi.fn().mockResolvedValue({ error: null })
    const mockSupabase = { from: vi.fn().mockReturnValue({ upsert: upsertFn }) }

    const explicitMissing = await syncConfigToCloudflareKV('free_daily_limit', 15, mockSupabase as any, {
      accountId: 'acct-1',
      namespaceId: 'ns-1',
      apiToken: ''
    })
    expect(explicitMissing.success).toBe(false)
    expect(explicitMissing.error).toContain('Missing Cloudflare KV credentials')
    expect(global.fetch).not.toHaveBeenCalled()
    expect(upsertFn).not.toHaveBeenCalled()

    delete process.env.VITEST
    process.env.NODE_ENV = 'production'
    const prodMissing = await syncConfigToCloudflareKV('free_daily_limit', 15, mockSupabase as any)
    expect(prodMissing.success).toBe(false)
    expect(prodMissing.error).toContain('Missing Cloudflare KV credentials')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('serializes raw system prompts without JSON quotes and serializes objects/arrays as JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    global.fetch = fetchMock
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null })
    }

    const prompt = 'Analyze this repository in Spanish.\nKeep it concise.'
    await syncConfigToCloudflareKV('system_prompt_repo', prompt, mockSupabase as any)
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/values/system_prompt_repo'),
      expect.objectContaining({
        method: 'PUT',
        body: prompt
      })
    )

    const flags = {
      mascot_enabled: true,
      diagrams_enabled: false,
      maintenance_mode: false,
      banner_message: 'Scheduled maintenance at 02:00 UTC'
    }
    await syncConfigToCloudflareKV('feature_flags', flags, mockSupabase as any)
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/values/feature_flags'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(flags)
      })
    )

    const priority = ['groq', 'gemini', 'cfAi', 'openRouter']
    await syncConfigToCloudflareKV('provider_priority', priority, mockSupabase as any)
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/values/provider_priority'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(priority)
      })
    )
  })

  it('uses server env credentials or explicit options and ignores VITE_CLOUDFLARE_API_TOKEN', async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-123'
    process.env.CLOUDFLARE_KV_NAMESPACE_ID = 'ns-456'
    process.env.CLOUDFLARE_API_TOKEN = 'secret-server-token'
    process.env.VITE_CLOUDFLARE_API_TOKEN = 'forbidden-client-token'

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    global.fetch = fetchMock
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null })
    }

    await syncConfigToCloudflareKV('pro_daily_limit', 250, mockSupabase as any)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/acct-123/storage/kv/namespaces/ns-456/values/pro_daily_limit',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-server-token'
        }),
        body: '250'
      })
    )

    delete process.env.CLOUDFLARE_API_TOKEN
    await syncConfigToCloudflareKV('pro_daily_limit', 300, mockSupabase as any)
    const lastCallHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string | undefined>
    expect(lastCallHeaders.Authorization).toBe('Bearer test-token')
    expect(JSON.stringify(lastCallHeaders)).not.toContain('forbidden-client-token')
  })

  it('returns failure if Supabase upsert fails after KV succeeds', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: { message: 'RLS policy violation' } })
    }

    const res = await syncConfigToCloudflareKV('free_daily_limit', 10, mockSupabase as any)
    expect(res.success).toBe(false)
    expect(res.error).toContain('RLS policy violation')
  })

  it('returns failure when key is blank', async () => {
    global.fetch = vi.fn()
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn()
    }

    const res = await syncConfigToCloudflareKV('   ', 10, mockSupabase as any)
    expect(res.success).toBe(false)
    expect(mockSupabase.upsert).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('purgeRepoCacheFromKVAndDB', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('deletes KV before Supabase and treats KV 404 as absent/success', async () => {
    const callOrder: string[] = []
    const fetchMock = vi.fn().mockImplementation(async () => {
      callOrder.push('kv_delete')
      return { ok: true, status: 200 }
    })
    global.fetch = fetchMock

    const eqSecond = vi.fn().mockImplementation(async () => {
      callOrder.push('supabase_delete')
      return { error: null }
    })
    const eqFirst = vi.fn().mockReturnValue({ eq: eqSecond })
    const deleteFn = vi.fn().mockReturnValue({ eq: eqFirst })
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ delete: deleteFn })
    }

    const res = await purgeRepoCacheFromKVAndDB(
      'Facebook/React',
      'abc123def',
      mockSupabase as any,
      {
        accountId: 'acct-1',
        namespaceId: 'ns-1',
        apiToken: 'tok-1'
      }
    )

    expect(res.success).toBe(true)
    expect(callOrder).toEqual(['kv_delete', 'kv_delete', 'kv_delete', 'supabase_delete'])
    expect(mockSupabase.from).toHaveBeenCalledWith('repo_analyses')
    expect(eqFirst).toHaveBeenCalledWith('repo_full_name', 'Facebook/React')
    expect(eqSecond).toHaveBeenCalledWith('commit_sha', 'abc123def')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/acct-1/storage/kv/namespaces/ns-1/values/cache%3Arepo%3Afacebook%3Areact%3Aabc123def',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          Authorization: 'Bearer tok-1'
        })
      })
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/acct-1/storage/kv/namespaces/ns-1/values/cache%3Arepo%3Afacebook%3Areact',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          Authorization: 'Bearer tok-1'
        })
      })
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/acct-1/storage/kv/namespaces/ns-1/values/cache%3Arepo-latest%3Afacebook%3Areact',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          Authorization: 'Bearer tok-1'
        })
      })
    )

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    const res404 = await purgeRepoCacheFromKVAndDB('Facebook/React', 'abc123def', mockSupabase as any)
    expect(res404.success).toBe(true)
  })

  it('aborts Supabase delete when KV DELETE fails with 500 or invalid repo name', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    const eqSecond = vi.fn().mockResolvedValue({ error: null })
    const eqFirst = vi.fn().mockReturnValue({ eq: eqSecond })
    const deleteFn = vi.fn().mockReturnValue({ eq: eqFirst })
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ delete: deleteFn })
    }

    const invalidRes = await purgeRepoCacheFromKVAndDB('invalid-repo', 'abc123', mockSupabase as any)
    expect(invalidRes.success).toBe(false)

    const kvErrorRes = await purgeRepoCacheFromKVAndDB('owner/repo', 'abc123', mockSupabase as any)
    expect(kvErrorRes.success).toBe(false)
    expect(kvErrorRes.error).toContain('500')
    expect(deleteFn).not.toHaveBeenCalled()
  })
})

describe('verifyAdminRole', () => {
  it('returns true only when profiles.role is admin', async () => {
    const adminSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [{ role: 'admin' }], error: null })
        })
      })
    }
    expect(await verifyAdminRole('user-admin', adminSupabase as any)).toBe(true)

    const userSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'user' }, error: null })
          })
        })
      })
    }
    expect(await verifyAdminRole('user-regular', userSupabase as any)).toBe(false)

    const missingSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null })
        })
      })
    }
    expect(await verifyAdminRole('user-missing', missingSupabase as any)).toBe(false)
    expect(await verifyAdminRole('', adminSupabase as any)).toBe(false)

    // Owner fallback allows admin even if profile table row is missing or role is not admin
    expect(KNOWN_ADMIN_EMAILS).toContain('crunaldo2@gmail.com')
    expect(await verifyAdminRole('owner-id', missingSupabase as any, 'crunaldo2@gmail.com')).toBe(true)
    expect(await verifyAdminRole('owner-id', userSupabase as any, 'crunaldo2@gmail.com')).toBe(true)
    expect(await verifyAdminRole('user-id', userSupabase as any, 'random@example.com')).toBe(false)
  })
})

describe('Admin API Handlers & Route Mounts', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  const upperEnv = {
    SUPABASE_URL: 'https://proj.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    CLOUDFLARE_ACCOUNT_ID: 'cf-acct',
    CLOUDFLARE_KV_NAMESPACE_ID: 'cf-ns',
    CLOUDFLARE_API_TOKEN: 'cf-tok'
  }

  it('rejects non-POST requests with 405 Method Not Allowed', async () => {
    const getSync = await handleAdminKvSyncRequest(
      new Request('https://admin.local/api/admin/kv-sync', { method: 'GET' }),
      upperEnv
    )
    expect(getSync.status).toBe(405)

    const getPurge = await handleAdminCachePurgeRequest(
      new Request('https://admin.local/api/admin/cache-purge', { method: 'GET' }),
      upperEnv
    )
    expect(getPurge.status).toBe(405)
  })

  it('returns 401 when Authorization header is missing or session is expired', async () => {
    const noAuth = await handleAdminKvSyncRequest(
      new Request('https://admin.local/api/admin/kv-sync', {
        method: 'POST',
        body: JSON.stringify({ key: 'free_daily_limit', value: 15 })
      }),
      upperEnv
    )
    expect(noAuth.status).toBe(401)

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 })
    const expiredAuth = await handleAdminKvSyncRequest(
      new Request('https://admin.local/api/admin/kv-sync', {
        method: 'POST',
        headers: { Authorization: 'Bearer expired-jwt' },
        body: JSON.stringify({ key: 'free_daily_limit', value: 15 })
      }),
      upperEnv
    )
    expect(expiredAuth.status).toBe(401)
  })

  it('returns 403 for authenticated non-admin users', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'user-1', email: 'user@example.com' })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ role: 'user' }]
      })

    const res = await handleAdminKvSyncRequest(
      new Request('https://admin.local/api/admin/kv-sync', {
        method: 'POST',
        headers: { Authorization: 'Bearer user-jwt' },
        body: JSON.stringify({ key: 'free_daily_limit', value: 15 })
      }),
      upperEnv
    )
    expect(res.status).toBe(403)
  })

  it('validates config keys and value types with 400 and syncs valid payloads with 200', async () => {
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'admin-1', email: 'admin@example.com' }), {
          status: 200
        })
      }
      if (url.includes('/rest/v1/profiles')) {
        return new Response(JSON.stringify([{ role: 'admin' }]), { status: 200 })
      }
      if (url.includes('api.cloudflare.com')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 })
      }
      if (url.includes('/rest/v1/remote_configs') || url.includes('/rest/v1/repo_analyses')) {
        return new Response(null, { status: 204 })
      }
      return new Response('not found', { status: 404 })
    })
    global.fetch = mockFetch as any

    const unknownKeyRes = await handleAdminKvSyncRequest(
      new Request('https://admin.local/api/admin/kv-sync', {
        method: 'POST',
        headers: { Authorization: 'Bearer admin-jwt' },
        body: JSON.stringify({ key: 'arbitrary_key', value: 123 })
      }),
      upperEnv
    )
    expect(unknownKeyRes.status).toBe(400)

    const badValueTypeRes = await handleAdminKvSyncRequest(
      new Request('https://admin.local/api/admin/kv-sync', {
        method: 'POST',
        headers: { Authorization: 'Bearer admin-jwt' },
        body: JSON.stringify({ key: 'free_daily_limit', value: -5 })
      }),
      upperEnv
    )
    expect(badValueTypeRes.status).toBe(400)

    const badPriorityRes = await handleAdminKvSyncRequest(
      new Request('https://admin.local/api/admin/kv-sync', {
        method: 'POST',
        headers: { Authorization: 'Bearer admin-jwt' },
        body: JSON.stringify({ key: 'provider_priority', value: ['unknown_provider'] })
      }),
      upperEnv
    )
    expect(badPriorityRes.status).toBe(400)

    const badTierRes = await handleAdminKvSyncRequest(
      new Request('https://admin.local/api/admin/kv-sync', {
        method: 'POST',
        headers: { Authorization: 'Bearer admin-jwt' },
        body: JSON.stringify({ key: 'default_new_user_tier', value: 'invalid_tier' })
      }),
      upperEnv
    )
    expect(badTierRes.status).toBe(400)

    const validTierFreeRes = await handleAdminKvSyncRequest(
      new Request('https://admin.local/api/admin/kv-sync', {
        method: 'POST',
        headers: { Authorization: 'Bearer admin-jwt' },
        body: JSON.stringify({ key: 'default_new_user_tier', value: 'free' })
      }),
      upperEnv
    )
    expect(validTierFreeRes.status).toBe(200)

    const validTierProRes = await handleAdminKvSyncRequest(
      new Request('https://admin.local/api/admin/kv-sync', {
        method: 'POST',
        headers: { Authorization: 'Bearer admin-jwt' },
        body: JSON.stringify({ key: 'default_new_user_tier', value: 'pro' })
      }),
      upperEnv
    )
    expect(validTierProRes.status).toBe(200)

    const validSyncRes = await handleAdminKvSyncRequest(
      new Request('https://admin.local/api/admin/kv-sync', {
        method: 'POST',
        headers: { Authorization: 'Bearer admin-jwt' },
        body: JSON.stringify({ key: 'free_daily_limit', value: 25 })
      }),
      upperEnv
    )
    expect(validSyncRes.status).toBe(200)

    const validPurgeRes = await handleAdminCachePurgeRequest(
      new Request('https://admin.local/api/admin/cache-purge', {
        method: 'POST',
        headers: { Authorization: 'Bearer admin-jwt' },
        body: JSON.stringify({ repoFullName: 'Owner/Repo', commitSha: 'deadbeef' })
      }),
      upperEnv
    )
    expect(validPurgeRes.status).toBe(200)

    process.env.SUPABASE_URL = upperEnv.SUPABASE_URL
    process.env.SUPABASE_ANON_KEY = upperEnv.SUPABASE_ANON_KEY
    process.env.CLOUDFLARE_ACCOUNT_ID = upperEnv.CLOUDFLARE_ACCOUNT_ID
    process.env.CLOUDFLARE_KV_NAMESPACE_ID = upperEnv.CLOUDFLARE_KV_NAMESPACE_ID
    process.env.CLOUDFLARE_API_TOKEN = upperEnv.CLOUDFLARE_API_TOKEN

    const nextSyncRes = await kvSyncRoutePost(
      new Request('https://admin.local/api/admin/kv-sync', {
        method: 'POST',
        headers: { Authorization: 'Bearer admin-jwt' },
        body: JSON.stringify({ key: 'pro_daily_limit', value: 300 })
      })
    )
    expect(nextSyncRes.status).toBe(200)

    const nextPurgeRes = await cachePurgeRoutePost(
      new Request('https://admin.local/api/admin/cache-purge', {
        method: 'POST',
        headers: { Authorization: 'Bearer admin-jwt' },
        body: JSON.stringify({ repoFullName: 'Owner/Repo', commitSha: 'deadbeef' })
      })
    )
    expect(nextPurgeRes.status).toBe(200)

    const cfSyncRes = await cfKvSyncPost({
      request: new Request('https://admin.local/api/admin/kv-sync', {
        method: 'POST',
        headers: { Authorization: 'Bearer admin-jwt' },
        body: JSON.stringify({ key: 'system_prompt_repo', value: 'Analyze cleanly.' })
      }),
      env: upperEnv
    })
    expect(cfSyncRes.status).toBe(200)

    const cfPurgeRes = await cfCachePurgePost({
      request: new Request('https://admin.local/api/admin/cache-purge', {
        method: 'POST',
        headers: { Authorization: 'Bearer admin-jwt' },
        body: JSON.stringify({ repoFullName: 'Owner/Repo', commitSha: 'deadbeef' })
      }),
      env: upperEnv
    })
    expect(cfPurgeRes.status).toBe(200)
  })

  it('uses native Cloudflare KV binding (env.KV) when bound in Pages Functions without requiring CLOUDFLARE_API_TOKEN', async () => {
    const kvPut = vi.fn().mockResolvedValue(undefined)
    const kvDelete = vi.fn().mockResolvedValue(undefined)
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'admin-1', email: 'admin@example.com' }), {
          status: 200
        })
      }
      if (url.includes('/rest/v1/profiles')) {
        return new Response(JSON.stringify([{ role: 'admin' }]), { status: 200 })
      }
      if (url.includes('/rest/v1/remote_configs') || url.includes('/rest/v1/repo_analyses')) {
        return new Response(null, { status: 204 })
      }
      throw new Error(`Unexpected fetch URL: ${url}`)
    })
    global.fetch = mockFetch as any

    const pagesBindingEnv = {
      SUPABASE_URL: 'https://proj.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      KV: { put: kvPut, delete: kvDelete }
    }

    const syncRes = await cfKvSyncPost({
      request: new Request('https://admin.local/api/admin/kv-sync', {
        method: 'POST',
        headers: { Authorization: 'Bearer admin-jwt' },
        body: JSON.stringify({ key: 'pro_daily_limit', value: 500 })
      }),
      env: pagesBindingEnv as any
    })
    expect(syncRes.status).toBe(200)
    expect(kvPut).toHaveBeenCalledWith('pro_daily_limit', '500')

    const purgeRes = await cfCachePurgePost({
      request: new Request('https://admin.local/api/admin/cache-purge', {
        method: 'POST',
        headers: { Authorization: 'Bearer admin-jwt' },
        body: JSON.stringify({ repoFullName: 'Crunaldo/Ext', commitSha: 'abcdef123' })
      }),
      env: pagesBindingEnv as any
    })
    expect(purgeRes.status).toBe(200)
    expect(kvDelete).toHaveBeenCalledWith('cache:repo:crunaldo:ext:abcdef123')
  })
})

describe('supabase-client error propagation & network resilience', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('catches network errors in fetchAuthUser, executeQuery, and dispatch helpers', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'))

    const authUser = await fetchAuthUser('token-123', {
      supabaseUrl: 'https://proj.supabase.co',
      supabaseAnonKey: 'anon-key'
    })
    expect(authUser).toBeNull()

    const client = createBrowserSupabaseClient('token-123', {
      supabaseUrl: 'https://proj.supabase.co',
      supabaseAnonKey: 'anon-key'
    })

    const configsRes = await fetchRemoteConfigsMap(client)
    expect(configsRes.error).toContain('Network offline')

    const logsRes = await fetchRecentQueryLogs(client)
    expect(logsRes.error).toContain('Network offline')

    const profilesRes = await fetchProfiles(client)
    expect(profilesRes.error).toContain('Network offline')

    const subsRes = await fetchSubscriptions(client)
    expect(subsRes.error).toContain('Network offline')

    const analysesRes = await fetchRepoAnalyses(client)
    expect(analysesRes.error).toContain('Network offline')

    const syncDispatch = await dispatchServerConfigSync('free_daily_limit', 15, 'token-123')
    expect(syncDispatch.success).toBe(false)
    expect(syncDispatch.error).toContain('Network offline')

    const purgeDispatch = await dispatchServerCachePurge('owner/repo', 'abc', 'token-123')
    expect(purgeDispatch.success).toBe(false)
    expect(purgeDispatch.error).toContain('Network offline')
  })

  it('propagates HTTP errors from PostgREST queries instead of silently returning empty state', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('JWT expired', { status: 401 }))
    const client = createBrowserSupabaseClient('expired-token', {
      supabaseUrl: 'https://proj.supabase.co',
      supabaseAnonKey: 'anon-key'
    })

    const configsRes = await fetchRemoteConfigsMap(client)
    expect(configsRes.error).toContain('JWT expired')
    expect(configsRes.data).toEqual({})
  })

  it('deduplicates historical repo_analyses by repo_full_name keeping the most recent', async () => {
    const rawRows = [
      { id: '1', repo_full_name: 'facebook/react', commit_sha: 'sha-new', created_at: '2026-11-19T10:00:00Z' },
      { id: '2', repo_full_name: 'Facebook/React', commit_sha: 'sha-old', created_at: '2026-11-18T10:00:00Z' },
      { id: '3', repo_full_name: 'vuejs/core', commit_sha: 'sha-vue', created_at: '2026-11-17T10:00:00Z' }
    ]
    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: rawRows, error: null })
          })
        })
      })
    }
    const result = await fetchRepoAnalyses(mockClient as any)
    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(2)
    expect(result.data[0]?.id).toBe('1')
    expect(result.data[1]?.id).toBe('3')
  })

  it('resolves static env vars and surfaces missing config, OAuth callback errors, and PKCE ?code= exchange', async () => {
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const prevAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://static-next.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'static-anon-key'

    try {
      expect(getPublicSupabaseConfig()).toEqual({
        supabaseUrl: 'https://static-next.supabase.co',
        supabaseAnonKey: 'static-anon-key'
      })
    } finally {
      if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
      else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl
      if (prevAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon
    }

    const missingRes = await startGitHubOAuthSignIn({ supabaseUrl: '', supabaseAnonKey: '' })
    expect(missingRes.ok).toBe(false)
    expect(missingRes.error).toContain('Supabase environment variables')

    const originalWindow = (globalThis as { window?: unknown }).window
    try {
      ;(globalThis as { window?: unknown }).window = {
        location: {
          search: '?error=access_denied&code=pkce-123',
          hash: '#error_description=User%20cancelled%20login'
        }
      }
      expect(parseOAuthCallbackFromUrl()).toEqual({
        accessToken: null,
        code: 'pkce-123',
        error: 'User cancelled login'
      })

      const sessionStore = new Map<string, string>([['gpi_admin_pkce_verifier', 'verifier-xyz']])
      ;(globalThis as { window?: unknown }).window = {
        location: { search: '?code=pkce-123', hash: '' },
        sessionStorage: {
          getItem: (k: string) => sessionStore.get(k) ?? null,
          setItem: (k: string, v: string) => sessionStore.set(k, v),
          removeItem: (k: string) => sessionStore.delete(k)
        },
        localStorage: {
          getItem: () => null,
          setItem: vi.fn(),
          removeItem: vi.fn()
        }
      }

      global.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: 'admin-pkce-jwt',
            user: { id: 'admin-uuid-9', email: 'admin@example.com' }
          }),
          { status: 200 }
        )
      )

      const exchanged = await exchangeAdminPkceCode('pkce-123', {
        supabaseUrl: 'https://proj.supabase.co',
        supabaseAnonKey: 'anon-key'
      })
      expect(exchanged.session).toEqual({
        accessToken: 'admin-pkce-jwt',
        userId: 'admin-uuid-9',
        email: 'admin@example.com'
      })
      expect(sessionStore.has('gpi_admin_pkce_verifier')).toBe(false)

      // Test resolveOAuthSessionFromUrl with hash fragment
      ;(globalThis as { window?: unknown }).window = {
        location: {
          search: '',
          hash: '#access_token=admin-hash-jwt&token_type=bearer'
        },
        localStorage: {
          getItem: () => null,
          setItem: vi.fn(),
          removeItem: vi.fn()
        }
      }

      global.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'admin-uuid-hash',
            email: 'crunaldo2@gmail.com',
            user_metadata: { user_name: 'crunaldo' }
          }),
          { status: 200 }
        )
      )

      const hashResolved = await resolveOAuthSessionFromUrl({
        supabaseUrl: 'https://proj.supabase.co',
        supabaseAnonKey: 'anon-key'
      })

      expect(hashResolved.session).toEqual({
        accessToken: 'admin-hash-jwt',
        userId: 'admin-uuid-hash',
        email: 'crunaldo2@gmail.com'
      })
    } finally {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
  })

  it('validates and syncs provider_api_keys to Cloudflare KV and Supabase', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    global.fetch = fetchMock
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null })
    }

    const payload = {
      keys: [
        {
          id: 'k1',
          provider: 'gemini',
          label: 'Gemini - Usuario 1',
          key: 'AIzaSyKey123',
          enabled: true
        },
        {
          id: 'k2',
          provider: 'gemini',
          label: 'Gemini - Usuario 2',
          key: 'AIzaSyKey456',
          enabled: true
        }
      ],
      strategy: 'priority_fallback'
    }

    const res = await syncConfigToCloudflareKV('provider_api_keys', payload, mockSupabase as any)
    expect(res.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/values/provider_api_keys'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(payload)
      })
    )
  })

  it('validates and syncs analysis_modules to Cloudflare KV and Supabase', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    global.fetch = fetchMock
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null })
    }

    const modules = {
      summary: 'free',
      installCommand: 'free',
      cloudSandbox: 'free',
      hardwareCompat: 'free',
      architectureDiagram: 'pro',
      deepAudit: 'pro',
      mascotChat: 'disabled'
    }

    const res = await syncConfigToCloudflareKV('analysis_modules', modules, mockSupabase as any)
    expect(res.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/values/analysis_modules'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(modules)
      })
    )
  })

  it('manages theme modes and logo variants properly', () => {
    const originalWindow = (globalThis as { window?: unknown }).window
    const originalDoc = (globalThis as { document?: unknown }).document
    try {
      const store = new Map<string, string>()
      ;(globalThis as { window?: unknown }).window = {
        localStorage: {
          getItem: (k: string) => store.get(k) ?? null,
          setItem: (k: string, v: string) => store.set(k, v),
          removeItem: (k: string) => store.delete(k)
        }
      }

      const classList = new Set<string>()
      ;(globalThis as { document?: unknown }).document = {
        documentElement: {
          classList: {
            add: (c: string) => classList.add(c),
            remove: (c: string) => classList.delete(c)
          }
        }
      }

      // Default theme is dark
      expect(getStoredTheme()).toBe('dark')

      // Set to light
      store.set('gpi_admin_theme', 'light')
      expect(getStoredTheme()).toBe('light')
      applyTheme('light')
      expect(classList.has('light')).toBe(true)
      expect(classList.has('dark')).toBe(false)

      // Apply dark
      applyTheme('dark')
      expect(classList.has('dark')).toBe(true)
      expect(classList.has('light')).toBe(false)

      // Default logo variant
      expect(getStoredLogoVariant()).toBe('default')
      expect(LOGO_VARIANTS.length).toBeGreaterThanOrEqual(6)
      expect(LOGO_VARIANTS.map((v) => v.id)).toContain('coding')
      expect(LOGO_VARIANTS.map((v) => v.id)).toContain('cool')

      // Custom stored variant
      store.set('gpi_admin_logo_variant', 'cool')
      expect(getStoredLogoVariant()).toBe('cool')
    } finally {
      ;(globalThis as { window?: unknown }).window = originalWindow
      ;(globalThis as { document?: unknown }).document = originalDoc
    }
  })
})
