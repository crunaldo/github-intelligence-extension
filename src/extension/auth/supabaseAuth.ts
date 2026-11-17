export interface AuthUser {
  id: string
  email?: string
  userName?: string
  avatarUrl?: string
}

export interface AuthSession {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  user: AuthUser
  isPro?: boolean
}

const AUTH_SESSION_STORAGE_KEY = 'gpi_auth_session'
const DEFAULT_SUPABASE_URL = 'https://your-project.supabase.co'
const DEFAULT_LEMON_SQUEEZY_CHECKOUT_URL =
  'https://github-intelligence.lemonsqueezy.com/checkout/buy/pro-monthly'

function getEnvVar(key: 'VITE_SUPABASE_URL' | 'VITE_LEMON_SQUEEZY_CHECKOUT_URL'): string | undefined {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    return env?.[key]
  } catch {
    return undefined
  }
}

export function getSupabaseUrl(): string {
  const configured = getEnvVar('VITE_SUPABASE_URL')?.trim()
  return (configured || DEFAULT_SUPABASE_URL).replace(/\/+$/, '')
}

export function getLemonSqueezyCheckoutUrl(): string {
  const configured = getEnvVar('VITE_LEMON_SQUEEZY_CHECKOUT_URL')?.trim()
  return configured || DEFAULT_LEMON_SQUEEZY_CHECKOUT_URL
}

function getChromeStorageLocal(): chrome.storage.StorageArea | null {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return chrome.storage.local
  }
  return null
}

async function openExternalUrl(url: string): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    await chrome.tabs.create({ url })
    return
  }
  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

function parseSessionFromRedirectUrl(
  redirectUrl: string,
  user: AuthUser
): AuthSession | null {
  try {
    const parsed = new URL(redirectUrl)
    const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''))
    const accessToken =
      hashParams.get('access_token') || parsed.searchParams.get('access_token')
    if (!accessToken) return null

    const refreshToken =
      hashParams.get('refresh_token') ||
      parsed.searchParams.get('refresh_token') ||
      undefined
    const expiresInRaw =
      hashParams.get('expires_in') || parsed.searchParams.get('expires_in')
    const expiresIn = expiresInRaw ? Number.parseInt(expiresInRaw, 10) : NaN

    return {
      accessToken,
      refreshToken,
      expiresAt: Number.isFinite(expiresIn) ? Date.now() + expiresIn * 1000 : undefined,
      user,
    }
  } catch {
    return null
  }
}

async function fetchSupabaseUser(
  supabaseUrl: string,
  accessToken: string
): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      id?: string
      email?: string
      user_metadata?: { user_name?: string; preferred_username?: string; avatar_url?: string }
    }
    if (!data?.id) return null
    return {
      id: data.id,
      email: data.email,
      userName: data.user_metadata?.user_name || data.user_metadata?.preferred_username,
      avatarUrl: data.user_metadata?.avatar_url,
    }
  } catch {
    return null
  }
}

/**
 * Reads the persisted Supabase authentication session from local extension storage.
 */
export async function getAuthSession(): Promise<AuthSession | null> {
  const storage = getChromeStorageLocal()
  if (storage) {
    const result = (await storage.get(AUTH_SESSION_STORAGE_KEY)) as Record<string, unknown>
    const session = result[AUTH_SESSION_STORAGE_KEY] as AuthSession | undefined
    if (session && session.accessToken && session.user?.id) {
      return session
    }
    return null
  }

  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthSession
    return parsed?.accessToken && parsed?.user?.id ? parsed : null
  } catch {
    return null
  }
}

/**
 * Persists a Supabase authentication session in local extension storage.
 */
export async function saveAuthSession(session: AuthSession): Promise<void> {
  const storage = getChromeStorageLocal()
  if (storage) {
    await storage.set({ [AUTH_SESSION_STORAGE_KEY]: session })
    return
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session))
  }
}

/**
 * Clears the persisted Supabase authentication session from local extension storage.
 */
export async function signOut(): Promise<void> {
  const storage = getChromeStorageLocal()
  if (storage) {
    await storage.remove(AUTH_SESSION_STORAGE_KEY)
    return
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
  }
}

/**
 * Initiates Supabase 1-click GitHub OAuth sign-in.
 * Uses `chrome.identity.launchWebAuthFlow` when available, otherwise opens the OAuth tab.
 */
export async function signInWithGitHub(): Promise<AuthSession | null> {
  const supabaseUrl = getSupabaseUrl()
  const identity =
    typeof chrome !== 'undefined'
      ? (chrome as unknown as {
          identity?: {
            getRedirectURL?: (path?: string) => string
            launchWebAuthFlow?: (
              details: { url: string; interactive: boolean },
              callback: (responseUrl?: string) => void
            ) => void
          }
        }).identity
      : undefined

  const redirectTo =
    identity?.getRedirectURL?.('supabase-auth') ||
    (typeof chrome !== 'undefined' && chrome.runtime?.id
      ? `https://${chrome.runtime.id}.chromiumapp.org/supabase-auth`
      : 'https://github.com')

  const authUrl = new URL(`${supabaseUrl}/auth/v1/authorize`)
  authUrl.searchParams.set('provider', 'github')
  authUrl.searchParams.set('redirect_to', redirectTo)

  if (identity?.launchWebAuthFlow) {
    const callbackUrl = await new Promise<string | undefined>((resolve) => {
      identity.launchWebAuthFlow!(
        { url: authUrl.toString(), interactive: true },
        (responseUrl) => resolve(responseUrl)
      )
    })

    if (callbackUrl) {
      const prelim = parseSessionFromRedirectUrl(callbackUrl, { id: '' })
      if (prelim?.accessToken) {
        const user = await fetchSupabaseUser(supabaseUrl, prelim.accessToken)
        if (user) {
          const fullSession: AuthSession = { ...prelim, user }
          await saveAuthSession(fullSession)
          return fullSession
        }
      }
    }
    return null
  }

  await openExternalUrl(authUrl.toString())
  return getAuthSession()
}

/**
 * Initiates a Pro upgrade checkout flow via Lemon Squeezy.
 * Enforces pre-purchase authentication: triggers GitHub OAuth if no session exists,
 * and passes `checkout[custom][user_id]` once authenticated.
 */
export async function initiateProUpgrade(deps?: {
  signIn?: () => Promise<AuthSession | null>
  openUrl?: (url: string) => Promise<void> | void
}): Promise<void> {
  let session = await getAuthSession()

  if (!session?.user?.id) {
    const signIn = deps?.signIn ?? signInWithGitHub
    session = await signIn()
  }

  if (!session?.user?.id) {
    // Interactive OAuth opened in another tab; wait for auth completion before checkout.
    return
  }

  const checkoutUrl = new URL(getLemonSqueezyCheckoutUrl())
  checkoutUrl.searchParams.set('checkout[custom][user_id]', session.user.id)
  if (session.user.email) {
    checkoutUrl.searchParams.set('checkout[email]', session.user.email)
  }

  const openUrl = deps?.openUrl ?? openExternalUrl
  await openUrl(checkoutUrl.toString())
}
