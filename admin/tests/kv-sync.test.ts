import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  purgeRepoCacheFromKVAndDB,
  syncConfigToCloudflareKV,
  verifyAdminRole
} from '../src/lib/kv-sync'

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
    expect(lastCallHeaders.Authorization).toBeUndefined()
    expect(JSON.stringify(lastCallHeaders)).not.toContain('forbidden-client-token')
  })

  it('returns failure without calling Cloudflare KV if Supabase upsert fails', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: { message: 'RLS policy violation' } })
    }

    const res = await syncConfigToCloudflareKV('free_daily_limit', 10, mockSupabase as any)
    expect(res.success).toBe(false)
    expect(res.error).toContain('RLS policy violation')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns failure when Cloudflare KV API responds with non-200 status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: vi.fn().mockResolvedValue('Unauthorized')
    })
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null })
    }

    const res = await syncConfigToCloudflareKV('free_daily_limit', 10, mockSupabase as any)
    expect(res.success).toBe(false)
    expect(res.error).toContain('403')
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

  it('deletes repo analysis from Supabase and purges normalized KV key via DELETE', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    global.fetch = fetchMock

    const eqSecond = vi.fn().mockResolvedValue({ error: null })
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
    expect(mockSupabase.from).toHaveBeenCalledWith('repo_analyses')
    expect(deleteFn).toHaveBeenCalled()
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
  })

  it('returns failure on invalid repository name or Cloudflare DELETE error', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    const eqSecond = vi.fn().mockResolvedValue({ error: null })
    const eqFirst = vi.fn().mockReturnValue({ eq: eqSecond })
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ delete: vi.fn().mockReturnValue({ eq: eqFirst }) })
    }

    const invalidRes = await purgeRepoCacheFromKVAndDB('invalid-repo', 'abc123', mockSupabase as any)
    expect(invalidRes.success).toBe(false)

    const kvErrorRes = await purgeRepoCacheFromKVAndDB('owner/repo', 'abc123', mockSupabase as any)
    expect(kvErrorRes.success).toBe(false)
    expect(kvErrorRes.error).toContain('500')
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
  })
})
