import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getGuestAnalysisCount,
  incrementGuestAnalysisCount,
  isGuestGateRequired,
  resetGuestAnalysisCount,
  GUEST_ANALYSIS_LIMIT,
} from '../utils/guestUsage'
import {
  saveAuthSession,
  signOut,
  getAuthSession,
  type AuthSession,
} from '../auth/supabaseAuth'
import {
  getConfiguredGitHubToken,
  setConfiguredGitHubToken,
} from '../../features/repository/github'
import { getStoredPreferences } from '../storage'

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

describe('End-to-End Guest Soft Gate & OAuth Token Flow', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    const storageMock = createMockChromeStorage()
    ;(globalThis as { chrome?: unknown }).chrome = {
      storage: { local: storageMock.local },
    }
    await resetGuestAnalysisCount()
    await signOut()
    setConfiguredGitHubToken(null)
  })

  it('orchestrates the entire guest trial, 5th query lock, OAuth token capture, and unlocked usage', async () => {
    // 1. Initial guest state: zero analyses, no gate
    expect(await getGuestAnalysisCount()).toBe(0)
    expect(await isGuestGateRequired(false)).toBe(false)
    expect(getConfiguredGitHubToken()).toBeNull()

    // 2. Perform 4 guest analyses
    for (let i = 1; i <= GUEST_ANALYSIS_LIMIT; i++) {
      expect(await isGuestGateRequired(false)).toBe(false)
      const count = await incrementGuestAnalysisCount()
      expect(count).toBe(i)
    }

    // 3. On 5th query, gate triggers!
    expect(await getGuestAnalysisCount()).toBe(4)
    const gateRequiredForGuest = await isGuestGateRequired(false)
    expect(gateRequiredForGuest).toBe(true)

    // 4. User completes GitHub OAuth sign-in with Opción A (read:user)
    const oauthSession: AuthSession = {
      accessToken: 'supabase-jwt-token-xyz',
      refreshToken: 'supabase-refresh-token-xyz',
      expiresAt: Date.now() + 3600 * 1000,
      user: {
        id: 'github-user-12345',
        userName: 'developer-pro',
        email: 'dev@example.com',
      },
      isPro: false,
      providerToken: 'gho_github_oauth_personal_token_777',
    }

    await saveAuthSession(oauthSession)

    // 5. Verify GitHub API token was automatically configured for GitHub API requests
    expect(getConfiguredGitHubToken()).toBe('gho_github_oauth_personal_token_777')
    const storedPrefs = await getStoredPreferences()
    expect(storedPrefs.githubToken).toBe('gho_github_oauth_personal_token_777')

    // 6. Verify gate is now permanently unlocked for the authenticated user
    const gateRequiredForAuth = await isGuestGateRequired(true)
    expect(gateRequiredForAuth).toBe(false)

    // 7. Verify session retrieval maintains the provider token
    const loadedSession = await getAuthSession()
    expect(loadedSession?.providerToken).toBe('gho_github_oauth_personal_token_777')
    expect(loadedSession?.accessToken).toBe('supabase-jwt-token-xyz')

    // 8. On sign out, provider token and configured GitHub token are cleaned up
    await signOut()
    expect(await getAuthSession()).toBeNull()
    expect(getConfiguredGitHubToken()).toBeNull()
  })
})
