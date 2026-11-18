import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  BackendApiError,
  clearLocalIntelligenceCache,
  fetchRepoIntelligence,
  fetchRemoteConfig,
  getModuleAccess,
  sanitizeCommitRef,
  isDailyQuotaExceeded,
  markDailyQuotaExceeded,
  clearDailyQuotaExceeded,
  getTodayUtcDateString,
} from '../api/backendClient'
import {
  getAuthSession,
  saveAuthSession,
  signInWithGitHub,
  signOut,
  initiateProUpgrade,
  refreshProStatus,
  type AuthSession,
} from '../auth/supabaseAuth'
import { getStoredGitHubToken, saveStoredPreferences } from '../storage'
import { TRANSLATIONS } from '../i18n'
import {
  classifySummaryError,
  generateFallbackSummary,
  mapAnalysisToColloquialSummary,
} from '../spanishSummary'
import type { RepositoryReport } from '../../features/repository/types'

function createMockChromeStorage(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial }
  return {
    store,
    local: {
      get: vi.fn(async (keys?: string | string[]) => {
        if (!keys) return { ...store }
        if (typeof keys === 'string') {
          return keys in store ? { [keys]: store[keys] } : {}
        }
        const out: Record<string, unknown> = {}
        for (const k of keys) {
          if (k in store) out[k] = store[k]
        }
        return out
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(store, items)
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const list = Array.isArray(keys) ? keys : [keys]
        for (const k of list) {
          delete store[k]
        }
      }),
    },
  }
}

function makeMockReport(): RepositoryReport {
  return {
    target: {
      owner: 'facebook',
      repository: 'react',
      ref: 'feat/monetization',
      refKind: 'branch',
      originalUrl: 'https://github.com/facebook/react',
    },
    repository: {
      id: 1,
      fullName: 'facebook/react',
      owner: 'facebook',
      name: 'react',
      description: 'A declarative JavaScript library for building user interfaces.',
      htmlUrl: 'https://github.com/facebook/react',
      homepage: null,
      createdAt: '2013-05-24T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      pushedAt: '2026-01-01T00:00:00Z',
      defaultBranch: 'main',
      stars: 220000,
      forks: 45000,
      watchers: 220000,
      openIssues: 900,
      sizeKb: 1000,
      archived: false,
      disabled: false,
      topics: ['react', 'ui'],
      license: { name: 'MIT License', spdxId: 'MIT', url: null },
    },
    resolvedRef: 'feat/monetization',
    analyzedAt: '2026-11-17T00:00:00Z',
    languages: [{ name: 'JavaScript', bytes: 10000 }],
    tree: [],
    treeTruncated: false,
    treeCountReported: 0,
    rootDirectories: [],
    importantFiles: [],
    readme: null,
    manifests: [],
    dependencies: [],
    latestCommit: null,
    latestRelease: null,
    simpleSummary: null,
    technicalSummary: '',
    sources: [],
    apiRateLimit: { remaining: null, resetAt: null },
  }
}

describe('Extension Backend Client & Auth', () => {
  const originalFetch = globalThis.fetch
  const originalChrome = (globalThis as { chrome?: unknown }).chrome

  beforeEach(() => {
    vi.restoreAllMocks()
    const storageMock = createMockChromeStorage()
    ;(globalThis as { chrome?: unknown }).chrome = {
      storage: { local: storageMock.local },
      tabs: { create: vi.fn(async () => ({ id: 1 })) },
      runtime: { id: 'ext-test-id', lastError: undefined },
    }
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    ;(globalThis as { chrome?: unknown }).chrome = originalChrome
  })

  it('sends X-Client-Signature for anonymous requests and exposes BackendApiError status & code on 429', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 429,
      ok: false,
      json: async () => ({ error: 'QUOTA_EXCEEDED', message: 'Daily free limit reached' }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    let caughtError: unknown
    try {
      await fetchRepoIntelligence('torvalds', 'linux', 'sha123')
    } catch (err) {
      caughtError = err
    }

    expect(caughtError).toBeInstanceOf(BackendApiError)
    expect((caughtError as BackendApiError).message).toBe('Daily free limit reached')
    expect((caughtError as BackendApiError).status).toBe(429)
    expect((caughtError as BackendApiError).code).toBe('QUOTA_EXCEEDED')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/v1\/analyze$/)
    expect(init.method).toBe('POST')

    const headers = new Headers(init.headers)
    const signature = headers.get('X-Client-Signature')
    expect(signature).toMatch(/^[0-9a-f]{64}$/)
    expect(headers.get('Authorization')).toBeNull()
  })

  it('sanitizes commitSha and rejects branch names with slashes to HEAD', async () => {
    expect(sanitizeCommitRef('feat/monetization')).toBe('HEAD')
    expect(sanitizeCommitRef('../secret')).toBe('HEAD')
    expect(sanitizeCommitRef('  ')).toBe('HEAD')
    expect(sanitizeCommitRef('abc123def')).toBe('abc123def')
    expect(sanitizeCommitRef('v2.0.1-rc.1')).toBe('v2.0.1-rc.1')

    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        summary: {
          headline: 'React',
          whatItIs: 'UI library.',
          whyItMatters: 'Popular.',
          practicalUse: 'Build UIs.',
          targetAudience: 'Web devs',
          stackPills: ['JS'],
        },
        providerUsed: 'gemini',
        tokensConsumed: 100,
      }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await fetchRepoIntelligence('facebook', 'react', 'feat/monetization')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      owner: 'facebook',
      repo: 'react',
      commitSha: 'HEAD',
    })
  })

  it('attaches Authorization Bearer JWT when authenticated and never sends githubToken to backend', async () => {
    await saveStoredPreferences({ githubToken: 'ghp_super_secret_local_pat_12345' })

    const session: AuthSession = {
      accessToken: 'jwt-pro-token-xyz',
      expiresAt: Date.now() + 3600_000,
      user: {
        id: 'user-uuid-123',
        email: 'dev@example.com',
        userName: 'octocat',
      },
      isPro: true,
    }
    await saveAuthSession(session)

    const payload = {
      summary: {
        headline: 'Linux kernel',
        whatItIs: 'Operating system kernel.',
        whyItMatters: 'Powers servers and devices worldwide.',
        practicalUse: 'Build OS distributions and drivers.',
        targetAudience: 'Systems engineers',
        stackPills: ['C', 'GPL-2.0'],
      },
      architectureDiagram: 'graph TD; A-->B;',
      deepAudit: {
        strengths: ['Mature'],
        concerns: ['Complex'],
      },
      providerUsed: 'gemini',
      tokensConsumed: 320,
    }

    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => payload,
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await fetchRepoIntelligence('torvalds', 'linux', 'sha123')
    expect(result.summary.headline).toBe('Linux kernel')
    expect(result.architectureDiagram).toBe('graph TD; A-->B;')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer jwt-pro-token-xyz')
    expect(headers.get('X-Client-Signature')).toMatch(/^[0-9a-f]{64}$/)

    const serializedHeaders = JSON.stringify(Object.fromEntries(headers.entries()))
    const serializedBody = String(init.body ?? '')
    expect(serializedHeaders).not.toContain('ghp_super_secret_local_pat_12345')
    expect(serializedBody).not.toContain('ghp_super_secret_local_pat_12345')

    await signOut()
    expect(await getAuthSession()).toBeNull()
  })

  it('signInWithGitHub supports launchWebAuthFlow implicit redirect, sends apikey, and populates isPro', async () => {
    const launchWebAuthFlow = vi.fn(
      (_details: { url: string; interactive: boolean }, cb: (url?: string) => void) => {
        cb(
          'https://ext-test-id.chromiumapp.org/supabase-auth#access_token=implicit-jwt&refresh_token=ref-1&expires_in=3600'
        )
      }
    )

    ;(globalThis as unknown as { chrome: Record<string, unknown> }).chrome = {
      ...(globalThis as unknown as { chrome: Record<string, unknown> }).chrome,
      identity: {
        getRedirectURL: () => 'https://ext-test-id.chromiumapp.org/supabase-auth',
        launchWebAuthFlow,
      },
    }

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('apikey')).toBeTruthy()
      expect(headers.get('Authorization')).toBe('Bearer implicit-jwt')

      if (url.includes('/auth/v1/user')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'supa-user-1',
            email: 'alice@example.com',
            user_metadata: { user_name: 'alice' },
          }),
        }
      }
      if (url.includes('/rest/v1/profiles')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ is_pro: true }],
        }
      }
      return { ok: false, status: 404, json: async () => ({}) }
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const session = await signInWithGitHub()
    expect(session).not.toBeNull()
    expect(session?.accessToken).toBe('implicit-jwt')
    expect(session?.isPro).toBe(true)
    expect(session?.user.id).toBe('supa-user-1')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('signInWithGitHub supports PKCE ?code= exchange and handles chrome.runtime.lastError cleanly', async () => {
    const launchWebAuthFlow = vi.fn(
      (_details: { url: string; interactive: boolean }, cb: (url?: string) => void) => {
        cb('https://ext-test-id.chromiumapp.org/supabase-auth?code=pkce-auth-code-99')
      }
    )

    ;(globalThis as unknown as { chrome: Record<string, unknown> }).chrome = {
      ...(globalThis as unknown as { chrome: Record<string, unknown> }).chrome,
      identity: {
        getRedirectURL: () => 'https://ext-test-id.chromiumapp.org/supabase-auth',
        launchWebAuthFlow,
      },
    }

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('apikey')).toBeTruthy()

      if (url.includes('/auth/v1/token?grant_type=pkce')) {
        const body = JSON.parse(String(init?.body))
        expect(body.auth_code).toBe('pkce-auth-code-99')
        expect(typeof body.code_verifier).toBe('string')
        expect(body.code_verifier.length).toBeGreaterThanOrEqual(32)
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'pkce-jwt-abc',
            refresh_token: 'pkce-refresh-xyz',
            expires_in: 3600,
            user: {
              id: 'supa-pkce-user',
              email: 'bob@example.com',
              user_metadata: { preferred_username: 'bob' },
            },
          }),
        }
      }
      if (url.includes('/rest/v1/profiles')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ is_pro: true }],
        }
      }
      return { ok: false, status: 404, json: async () => ({}) }
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const pkceSession = await signInWithGitHub()
    expect(pkceSession?.accessToken).toBe('pkce-jwt-abc')
    expect(pkceSession?.refreshToken).toBe('pkce-refresh-xyz')
    expect(pkceSession?.isPro).toBe(true)

    // Now simulate user cancel / chrome.runtime.lastError
    await signOut()
    const errorChrome = (globalThis as unknown as { chrome: { runtime: { lastError?: { message: string } } } })
      .chrome
    launchWebAuthFlow.mockImplementationOnce((_details, cb) => {
      errorChrome.runtime.lastError = { message: 'The user did not approve access.' }
      cb(undefined)
    })

    const cancelled = await signInWithGitHub()
    expect(cancelled).toBeNull()
    expect(await getAuthSession()).toBeNull()
  })

  it('refreshes expired JWT via /auth/v1/token?grant_type=refresh_token and clears stale sessions on failure', async () => {
    await saveAuthSession({
      accessToken: 'expired-jwt',
      refreshToken: 'valid-refresh-token',
      expiresAt: Date.now() - 5000,
      user: { id: 'user-refresh-1', userName: 'refresher' },
      isPro: false,
    })

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('apikey')).toBeTruthy()
      if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
        expect(JSON.parse(String(init?.body))).toEqual({ refresh_token: 'valid-refresh-token' })
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'fresh-jwt-token',
            refresh_token: 'rotated-refresh-token',
            expires_in: 3600,
          }),
        }
      }
      if (url.includes('/rest/v1/profiles')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ is_pro: true }],
        }
      }
      return { ok: false, status: 404, json: async () => ({}) }
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const refreshed = await getAuthSession()
    expect(refreshed?.accessToken).toBe('fresh-jwt-token')
    expect(refreshed?.refreshToken).toBe('rotated-refresh-token')
    expect(refreshed?.isPro).toBe(true)

    // refreshProStatus keeps status synced
    const synced = await refreshProStatus()
    expect(synced?.isPro).toBe(true)

    // Failed refresh clears stale session
    await saveAuthSession({
      accessToken: 'expired-jwt-2',
      refreshToken: 'bad-refresh',
      expiresAt: Date.now() - 5000,
      user: { id: 'user-refresh-2' },
    })
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'invalid_grant' }),
    }) as unknown as typeof fetch

    expect(await getAuthSession()).toBeNull()
  })

  it('fetches and normalizes remote config from /v1/config', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        free_daily_limit: 15,
        pro_daily_limit: 250,
        feature_flags: {
          mascot_enabled: true,
          diagrams_enabled: false,
          maintenance_mode: false,
          banner_message: 'Welcome',
        },
      }),
    }) as unknown as typeof fetch

    const config = await fetchRemoteConfig()
    expect(config).toMatchObject({
      freeDailyLimit: 15,
      proDailyLimit: 250,
      featureFlags: {
        enableMascot: true,
        enableDiagrams: false,
        maintenanceMode: false,
        bannerMessage: 'Welcome',
      },
    })
  })

  it('getStoredGitHubToken reads strictly from local storage preferences', async () => {
    await saveStoredPreferences({ githubToken: '  ghp_local_only_token  ' })
    const token = await getStoredGitHubToken()
    expect(token).toBe('ghp_local_only_token')
  })

  it('initiateProUpgrade triggers GitHub auth when unauthenticated and opens Lemon Squeezy checkout with user_id when authenticated', async () => {
    const tabsCreate = (
      (globalThis as unknown as { chrome: { tabs: { create: ReturnType<typeof vi.fn> } } }).chrome
        .tabs.create
    )

    // 1. Unauthenticated -> triggers GitHub OAuth (without dead chromiumapp.org tab) and does NOT open Lemon Squeezy
    await initiateProUpgrade()
    expect(tabsCreate).toHaveBeenCalledTimes(1)
    const authCallArg = tabsCreate.mock.calls[0]?.[0] as { url: string }
    expect(authCallArg.url).toContain('provider=github')
    expect(authCallArg.url).not.toContain('chromiumapp.org')
    expect(authCallArg.url).not.toContain('lemonsqueezy')

    tabsCreate.mockClear()

    // 2. Authenticated -> opens Lemon Squeezy checkout with checkout[custom][user_id]
    await saveAuthSession({
      accessToken: 'jwt-123',
      expiresAt: Date.now() + 3600_000,
      user: {
        id: 'supa-user-999',
        email: 'pro@example.com',
      },
    })

    await initiateProUpgrade()
    expect(tabsCreate).toHaveBeenCalledTimes(1)
    const checkoutCallArg = tabsCreate.mock.calls[0]?.[0] as { url: string }
    const parsedUrl = new URL(checkoutCallArg.url)
    expect(parsedUrl.hostname).toContain('lemonsqueezy')
    expect(parsedUrl.searchParams.get('checkout[custom][user_id]')).toBe('supa-user-999')
    expect(parsedUrl.searchParams.get('checkout[email]')).toBe('pro@example.com')
  })

  it('maps backend FilteredAnalysisResult cleanly and never leaves Fetching placeholder on error fallback', () => {
    const mapped = mapAnalysisToColloquialSummary(
      {
        summary: {
          headline: 'Fast bundler',
          whatItIs: 'Next-gen frontend build tool. Uses native ESM.',
          whyItMatters: 'Instant HMR.',
          practicalUse: 'Build web apps.',
          targetAudience: 'Frontend engineers',
          stackPills: ['TypeScript', 'MIT'],
        },
        providerUsed: 'groq',
        tokensConsumed: 180,
      },
      'en'
    )

    expect(mapped.headline).toBe('Fast bundler')
    expect(mapped.shortDescription).toBe('Next-gen frontend build tool.')
    expect(mapped.stackPills).toEqual(['TypeScript', 'MIT'])

    const report = makeMockReport()
    const fallbackEn = generateFallbackSummary(report, 'en')
    const fallbackEs = generateFallbackSummary(report, 'es')
    expect(fallbackEn.whyItMatters).not.toContain('Fetching')
    expect(fallbackEs.whyItMatters).not.toContain('Obteniendo')

    expect(
      classifySummaryError(new BackendApiError('Daily free limit reached', 429, 'QUOTA_EXCEEDED'))
    ).toEqual({ quotaExceeded: true, errorMessage: null })

    expect(
      classifySummaryError(new BackendApiError('Service unavailable', 503, 'AI_PROVIDERS_EXHAUSTED'))
    ).toEqual({ quotaExceeded: false, errorMessage: 'Service unavailable' })

    expect(
      classifySummaryError(
        new BackendApiError('Planned maintenance window', 503, 'MAINTENANCE_MODE')
      )
    ).toEqual({
      quotaExceeded: false,
      maintenanceMode: true,
      errorMessage: 'Planned maintenance window',
    })
  })

  it('caches fetchRepoIntelligence locally per owner/repo@commitSha:tier and supports forceRefresh', async () => {
    await clearLocalIntelligenceCache()

    const freePayload = {
      summary: {
        headline: 'Vite',
        whatItIs: 'Build tool.',
        whyItMatters: 'Fast.',
        practicalUse: 'Bundle.',
        targetAudience: 'Web devs',
        stackPills: ['TS'],
      },
      providerUsed: 'gemini',
      tokensConsumed: 120,
    }

    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => freePayload,
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    // 1. Concurrent + subsequent calls share a single /v1/analyze request
    const [first, second] = await Promise.all([
      fetchRepoIntelligence('vitejs', 'vite', 'sha-vite-1'),
      fetchRepoIntelligence('vitejs', 'vite', 'sha-vite-1'),
    ])
    const third = await fetchRepoIntelligence('ViteJS', 'Vite', 'sha-vite-1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(first.summary.headline).toBe('Vite')
    expect(second.summary.headline).toBe('Vite')
    expect(third.summary.headline).toBe('Vite')

    // 2. forceRefresh bypasses cache
    await fetchRepoIntelligence('vitejs', 'vite', 'sha-vite-1', { forceRefresh: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // 3. Tier change (anonymous -> Pro user) isolates cache key and fetches Pro payload
    await saveAuthSession({
      accessToken: 'jwt-pro-cache',
      expiresAt: Date.now() + 60_000,
      user: { id: 'pro-cache-user' },
      isPro: true,
    })
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        ...freePayload,
        architectureDiagram: 'graph TD; Vite-->Rollup;',
      }),
    })

    const proResult = await fetchRepoIntelligence('vitejs', 'vite', 'sha-vite-1')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(proResult.architectureDiagram).toBe('graph TD; Vite-->Rollup;')
  })

  it('preserves refreshToken on transient 5xx or offline network errors during token refresh', async () => {
    const expiredSession: AuthSession = {
      accessToken: 'expired-jwt-offline',
      refreshToken: 'keep-me-refresh-token',
      expiresAt: Date.now() - 10_000,
      user: { id: 'user-offline-1', userName: 'offline-dev' },
      isPro: true,
    }
    await saveAuthSession(expiredSession)

    // 1. Transient 503 -> returns null without wiping stored refreshToken
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'service_unavailable' }),
    }) as unknown as typeof fetch

    expect(await getAuthSession()).toBeNull()
    const storageLocal = (
      globalThis as unknown as {
        chrome: { storage: { local: { get: (k: string) => Promise<Record<string, AuthSession>> } } }
      }
    ).chrome.storage.local
    const after503 = await storageLocal.get('gpi_auth_session')
    expect(after503.gpi_auth_session?.refreshToken).toBe('keep-me-refresh-token')

    // 2. Network throw -> returns null without wiping stored refreshToken
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline')) as unknown as typeof fetch
    expect(await getAuthSession()).toBeNull()
    const afterNetworkErr = await storageLocal.get('gpi_auth_session')
    expect(afterNetworkErr.gpi_auth_session?.refreshToken).toBe('keep-me-refresh-token')

    // 3. Explicit 400 invalid_grant -> clears stored session
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    }) as unknown as typeof fetch
    expect(await getAuthSession()).toBeNull()
    const after400 = await storageLocal.get('gpi_auth_session')
    expect(after400.gpi_auth_session).toBeUndefined()
  })

  it('removes 60 and 5,000 requests/hour explanations from GitHub PAT i18n copy', () => {
    const keysToCheck = [
      'rate_limit_alert_title',
      'rate_limit_alert_desc',
      'token_benefit_desc',
      'instruction_6',
    ] as const

    for (const locale of ['es', 'en'] as const) {
      for (const key of keysToCheck) {
        const text = TRANSLATIONS[locale][key] || ''
        expect(text).not.toMatch(/\b60\b/)
        expect(text).not.toMatch(/5[,.]?000/)
        expect(text.toLowerCase()).not.toContain('peticiones/h')
        expect(text.toLowerCase()).not.toContain('requests/h')
      }
    }
  })

  describe('daily quota tracking', () => {
    it('tracks daily quota in storage, identifies today UTC, and resets properly', async () => {
      const today = getTodayUtcDateString()
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(await isDailyQuotaExceeded()).toBe(false)

      await markDailyQuotaExceeded()
      expect(await isDailyQuotaExceeded()).toBe(true)

      await clearDailyQuotaExceeded()
      expect(await isDailyQuotaExceeded()).toBe(false)
    })

    it('pro users bypass isDailyQuotaExceeded', async () => {
      await markDailyQuotaExceeded()
      expect(await isDailyQuotaExceeded()).toBe(true)

      await saveAuthSession({
        accessToken: 'valid-jwt',
        refreshToken: 'valid-refresh',
        expiresAt: Date.now() + 100_000,
        user: { id: 'pro-user-1', userName: 'pro' },
        isPro: true,
      })

      expect(await isDailyQuotaExceeded()).toBe(false)
    })

    it('marks daily quota as exceeded automatically on fetchRepoIntelligence HTTP 429', async () => {
      await clearDailyQuotaExceeded()
      expect(await isDailyQuotaExceeded()).toBe(false)

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          error: 'QUOTA_EXCEEDED',
          message: 'Daily free limit reached',
        }),
      }) as unknown as typeof fetch

      await expect(
        fetchRepoIntelligence('some-owner', 'some-repo', 'sha123')
      ).rejects.toThrow('Daily free limit reached')

      expect(await isDailyQuotaExceeded()).toBe(true)
    })
  })
})
