import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchRepoIntelligence, fetchRemoteConfig } from '../api/backendClient'
import {
  getAuthSession,
  saveAuthSession,
  signOut,
  initiateProUpgrade,
  type AuthSession,
} from '../auth/supabaseAuth'
import { getStoredGitHubToken, saveStoredPreferences } from '../storage'
import { TRANSLATIONS } from '../i18n'
import { mapAnalysisToColloquialSummary } from '../spanishSummary'

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

describe('Extension Backend Client & Auth', () => {
  const originalFetch = globalThis.fetch
  const originalChrome = (globalThis as { chrome?: unknown }).chrome

  beforeEach(() => {
    vi.restoreAllMocks()
    const storageMock = createMockChromeStorage()
    ;(globalThis as { chrome?: unknown }).chrome = {
      storage: { local: storageMock.local },
      tabs: { create: vi.fn(async () => ({ id: 1 })) },
    }
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    ;(globalThis as { chrome?: unknown }).chrome = originalChrome
  })

  it('sends X-Client-Signature for anonymous requests and handles 429 quota reached', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 429,
      ok: false,
      json: async () => ({ error: 'QUOTA_EXCEEDED', message: 'Daily free limit reached' }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await expect(fetchRepoIntelligence('torvalds', 'linux', 'sha123')).rejects.toThrow(
      'Daily free limit reached'
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/v1\/analyze$/)
    expect(init.method).toBe('POST')

    const headers = new Headers(init.headers)
    const signature = headers.get('X-Client-Signature')
    expect(signature).toMatch(/^[0-9a-f]{64}$/)
    expect(headers.get('Authorization')).toBeNull()
  })

  it('attaches Authorization Bearer JWT when authenticated and never sends githubToken to backend', async () => {
    await saveStoredPreferences({ githubToken: 'ghp_super_secret_local_pat_12345' })

    const session: AuthSession = {
      accessToken: 'jwt-pro-token-xyz',
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
    expect(config).toEqual({
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

    // 1. Unauthenticated -> must trigger GitHub OAuth and NOT open Lemon Squeezy without user_id
    await initiateProUpgrade()
    expect(tabsCreate).toHaveBeenCalledTimes(1)
    const authCallArg = tabsCreate.mock.calls[0]?.[0] as { url: string }
    expect(authCallArg.url).toContain('provider=github')
    expect(authCallArg.url).not.toContain('lemonsqueezy')

    tabsCreate.mockClear()

    // 2. Authenticated -> must open Lemon Squeezy checkout with checkout[custom][user_id]
    await saveAuthSession({
      accessToken: 'jwt-123',
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

  it('maps backend FilteredAnalysisResult cleanly into ColloquialExplanation', () => {
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
})
