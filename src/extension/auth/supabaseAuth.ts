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
const DAILY_QUOTA_STORAGE_KEY = 'gpi_daily_quota_exceeded'
const DEFAULT_SUPABASE_URL = 'https://your-project.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY = 'public-anon-key-placeholder'
const DEFAULT_LEMON_SQUEEZY_CHECKOUT_URL =
  'https://github-intelligence.lemonsqueezy.com/checkout/buy/pro-monthly'
const TOKEN_EXPIRY_BUFFER_MS = 30_000

function getEnvVar(
  key: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY' | 'VITE_LEMON_SQUEEZY_CHECKOUT_URL'
): string | undefined {
  try {
    if (key === 'VITE_SUPABASE_URL') {
      return (import.meta as unknown as { env?: Record<string, string | undefined> }).env
        ?.VITE_SUPABASE_URL
    }
    if (key === 'VITE_SUPABASE_ANON_KEY') {
      return (import.meta as unknown as { env?: Record<string, string | undefined> }).env
        ?.VITE_SUPABASE_ANON_KEY
    }
    return (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_LEMON_SQUEEZY_CHECKOUT_URL
  } catch {
    return undefined
  }
}

export function getSupabaseUrl(): string {
  const configured = getEnvVar('VITE_SUPABASE_URL')?.trim()
  return (configured || DEFAULT_SUPABASE_URL).replace(/\/+$/, '')
}

export function getSupabaseAnonKey(): string {
  const configured = getEnvVar('VITE_SUPABASE_ANON_KEY')?.trim()
  return configured || DEFAULT_SUPABASE_ANON_KEY
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

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64')
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function generateCodeVerifier(): string {
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

function extractAuthParamsFromUrl(redirectUrl: string): {
  code?: string
  accessToken?: string
  refreshToken?: string
  expiresIn?: number
} {
  try {
    const parsed = new URL(redirectUrl)
    const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''))
    const code = parsed.searchParams.get('code') || hashParams.get('code') || undefined
    const accessToken =
      hashParams.get('access_token') || parsed.searchParams.get('access_token') || undefined
    const refreshToken =
      hashParams.get('refresh_token') || parsed.searchParams.get('refresh_token') || undefined
    const expiresInRaw =
      hashParams.get('expires_in') || parsed.searchParams.get('expires_in')
    const expiresIn = expiresInRaw ? Number.parseInt(expiresInRaw, 10) : NaN

    return {
      code,
      accessToken,
      refreshToken,
      expiresIn: Number.isFinite(expiresIn) ? expiresIn : undefined,
    }
  } catch {
    return {}
  }
}

interface RawSupabaseUser {
  id?: string
  email?: string
  user_metadata?: {
    user_name?: string
    preferred_username?: string
    avatar_url?: string
  }
}

function mapSupabaseUser(data: RawSupabaseUser | undefined | null): AuthUser | null {
  if (!data?.id) return null
  return {
    id: data.id,
    email: data.email,
    userName: data.user_metadata?.user_name || data.user_metadata?.preferred_username,
    avatarUrl: data.user_metadata?.avatar_url,
  }
}

async function fetchSupabaseUser(
  supabaseUrl: string,
  accessToken: string
): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: getSupabaseAnonKey(),
        Authorization: `Bearer ${accessToken}`,
      },
    })
    if (!res.ok) return null
    const data = (await res.json()) as RawSupabaseUser
    return mapSupabaseUser(data)
  } catch {
    return null
  }
}

async function fetchProStatus(
  supabaseUrl: string,
  accessToken: string,
  userId: string
): Promise<boolean | null> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=is_pro`,
      {
        headers: {
          apikey: getSupabaseAnonKey(),
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )
    if (!res.ok) return null
    const rows = (await res.json()) as Array<{ is_pro?: boolean }>
    return Boolean(rows?.[0]?.is_pro)
  } catch {
    return null
  }
}

async function readStoredSessionRaw(): Promise<AuthSession | null> {
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

function isSessionExpired(session: AuthSession): boolean {
  if (typeof session.expiresAt !== 'number') return false
  return Date.now() >= session.expiresAt - TOKEN_EXPIRY_BUFFER_MS
}

async function refreshSessionToken(session: AuthSession): Promise<AuthSession | null> {
  if (!session.refreshToken) {
    await signOut()
    return null
  }

  const supabaseUrl = getSupabaseUrl()
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: getSupabaseAnonKey(),
      },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    })

    if (!res.ok) {
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        await signOut()
      }
      return null
    }

    const tokenPayload = (await res.json()) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      user?: RawSupabaseUser
    }

    if (!tokenPayload?.access_token) {
      return null
    }

    const refreshedUser = mapSupabaseUser(tokenPayload.user) ?? session.user
    const proStatus = await fetchProStatus(supabaseUrl, tokenPayload.access_token, refreshedUser.id)
    const refreshedSession: AuthSession = {
      accessToken: tokenPayload.access_token,
      refreshToken: tokenPayload.refresh_token || session.refreshToken,
      expiresAt:
        typeof tokenPayload.expires_in === 'number'
          ? Date.now() + tokenPayload.expires_in * 1000
          : undefined,
      user: refreshedUser,
      isPro: proStatus ?? session.isPro ?? false,
    }

    await saveAuthSession(refreshedSession)
    return refreshedSession
  } catch {
    // Preserve stored refreshToken across transient offline/network errors
    return null
  }
}

/**
 * Reads the persisted Supabase authentication session from local extension storage.
 * Automatically refreshes expired tokens when a `refreshToken` is available, or clears stale sessions.
 */
export async function getAuthSession(): Promise<AuthSession | null> {
  const session = await readStoredSessionRaw()
  if (!session) return null

  if (isSessionExpired(session)) {
    return refreshSessionToken(session)
  }

  return session
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
 * Queries Supabase `profiles.is_pro` for the current session and persists the updated `isPro` flag.
 */
export async function refreshProStatus(): Promise<AuthSession | null> {
  const session = await getAuthSession()
  if (!session) return null

  const supabaseUrl = getSupabaseUrl()
  let proStatus = await fetchProStatus(supabaseUrl, session.accessToken, session.user.id)

  // If token was expired/rejected, attempt token refresh and retry query
  if (proStatus === null && session.refreshToken) {
    const refreshedToken = await refreshSessionToken(session)
    if (refreshedToken) {
      proStatus = await fetchProStatus(supabaseUrl, refreshedToken.accessToken, refreshedToken.user.id)
    }
  }

  if (proStatus === null) {
    return session
  }

  if (proStatus) {
    const storage = getChromeStorageLocal()
    if (storage) {
      await storage.remove(DAILY_QUOTA_STORAGE_KEY).catch(() => {})
    } else if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(DAILY_QUOTA_STORAGE_KEY)
    }
  }

  const updated: AuthSession = { ...session, isPro: proStatus }
  await saveAuthSession(updated)
  return updated
}

/**
 * Subscribes to live changes in the persisted authentication session across extension tabs/contexts.
 */
export function subscribeToAuthSession(
  callback: (session: AuthSession | null) => void
): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ) => {
    if (areaName === 'local' && changes[AUTH_SESSION_STORAGE_KEY]) {
      callback((changes[AUTH_SESSION_STORAGE_KEY].newValue as AuthSession) || null)
    }
  }

  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(listener)
    return () => {
      chrome.storage.onChanged.removeListener(listener)
    }
  }

  return () => {}
}

async function exchangePkceCode(
  supabaseUrl: string,
  code: string,
  codeVerifier: string
): Promise<AuthSession | null> {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: getSupabaseAnonKey(),
      },
      body: JSON.stringify({
        auth_code: code,
        code_verifier: codeVerifier,
      }),
    })
    if (!res.ok) return null

    const data = (await res.json()) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      user?: RawSupabaseUser
    }

    if (!data?.access_token) return null

    const user =
      mapSupabaseUser(data.user) ?? (await fetchSupabaseUser(supabaseUrl, data.access_token))
    if (!user) return null

    const proStatus = await fetchProStatus(supabaseUrl, data.access_token, user.id)

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt:
        typeof data.expires_in === 'number'
          ? Date.now() + data.expires_in * 1000
          : undefined,
      user,
      isPro: proStatus ?? false,
    }
  } catch {
    return null
  }
}

/**
 * Initiates Supabase 1-click GitHub OAuth sign-in via `chrome.identity.launchWebAuthFlow`
 * with PKCE and implicit `#access_token` redirect support, populating `isPro` from `profiles`.
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

  const codeVerifier = generateCodeVerifier()
  const { challenge: codeChallenge, method: codeChallengeMethod } = await createPkceChallenge(codeVerifier)

  const authUrl = new URL(`${supabaseUrl}/auth/v1/authorize`)
  authUrl.searchParams.set('provider', 'github')
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', codeChallengeMethod)

  if (identity?.launchWebAuthFlow) {
    const redirectTo =
      identity.getRedirectURL?.('supabase-auth') ||
      (typeof chrome !== 'undefined' && chrome.runtime?.id
        ? `https://${chrome.runtime.id}.chromiumapp.org/supabase-auth`
        : supabaseUrl)

    authUrl.searchParams.set('redirect_to', redirectTo)

    const callbackUrl = await new Promise<string | undefined>((resolve) => {
      identity.launchWebAuthFlow!(
        { url: authUrl.toString(), interactive: true },
        (responseUrl) => {
          const lastError =
            typeof chrome !== 'undefined' ? chrome.runtime?.lastError : undefined
          if (lastError || !responseUrl) {
            resolve(undefined)
            return
          }
          resolve(responseUrl)
        }
      )
    })

    if (!callbackUrl) {
      return null
    }

    const params = extractAuthParamsFromUrl(callbackUrl)

    if (params.code) {
      const pkceSession = await exchangePkceCode(supabaseUrl, params.code, codeVerifier)
      if (pkceSession) {
        await saveAuthSession(pkceSession)
        return pkceSession
      }
      return null
    }

    if (params.accessToken) {
      const user = await fetchSupabaseUser(supabaseUrl, params.accessToken)
      if (user) {
        const proStatus = await fetchProStatus(supabaseUrl, params.accessToken, user.id)
        const fullSession: AuthSession = {
          accessToken: params.accessToken,
          refreshToken: params.refreshToken,
          expiresAt:
            typeof params.expiresIn === 'number'
              ? Date.now() + params.expiresIn * 1000
              : undefined,
          user,
          isPro: proStatus ?? false,
        }
        await saveAuthSession(fullSession)
        return fullSession
      }
    }

    return null
  }

  // Non-identity fallback: never open a dead chromiumapp.org redirect URL.
  const webRedirect =
    typeof window !== 'undefined' && window.location?.origin?.startsWith('http')
      ? window.location.origin
      : supabaseUrl
  authUrl.searchParams.set('redirect_to', webRedirect)

  await openExternalUrl(authUrl.toString())
  return getAuthSession()
}

/**
 * Initiates a Pro upgrade checkout flow via Lemon Squeezy.
 * Enforces pre-purchase authentication: triggers GitHub OAuth if no session exists,
 * and passes `checkout[custom][user_id]` once authenticated.
 * Returns the authenticated session if checkout was opened, or `null` if sign-in did not complete.
 */
export async function initiateProUpgrade(deps?: {
  signIn?: () => Promise<AuthSession | null>
  openUrl?: (url: string) => Promise<void> | void
}): Promise<AuthSession | null> {
  let session = await getAuthSession()

  if (!session?.user?.id) {
    const signIn = deps?.signIn ?? signInWithGitHub
    session = await signIn()
  }

  if (!session?.user?.id) {
    // Interactive OAuth did not complete yet; wait for auth completion before checkout.
    return null
  }

  const checkoutUrl = new URL(getLemonSqueezyCheckoutUrl())
  checkoutUrl.searchParams.set('checkout[custom][user_id]', session.user.id)
  if (session.user.email) {
    checkoutUrl.searchParams.set('checkout[email]', session.user.email)
  }

  const openUrl = deps?.openUrl ?? openExternalUrl
  await openUrl(checkoutUrl.toString())
  return session
}

export interface AuthRuntimeResponse {
  ok: boolean
  session?: AuthSession | null
  error?: string
}

/**
 * Handles background service worker runtime messages for GitHub OAuth sign-in
 * and Lemon Squeezy Pro upgrade checkout where `chrome.identity` and `chrome.tabs`
 * are available. Returns `null` if the message type is not an auth action.
 */
export async function handleAuthRuntimeMessage(
  message: { type?: unknown } | null | undefined,
  deps?: {
    signIn?: () => Promise<AuthSession | null>
    upgrade?: () => Promise<AuthSession | null | void>
    getSession?: () => Promise<AuthSession | null>
  }
): Promise<AuthRuntimeResponse | null> {
  if (!message || typeof message !== 'object') {
    return null
  }

  if (message.type === 'SIGN_IN_WITH_GITHUB') {
    try {
      const session = await (deps?.signIn ?? signInWithGitHub)()
      if (!session) {
        return {
          ok: false,
          session: null,
          error: 'GitHub sign-in was cancelled or did not complete.',
        }
      }
      return { ok: true, session }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'GitHub sign-in failed',
      }
    }
  }

  if (message.type === 'INITIATE_PRO_UPGRADE') {
    try {
      const upgradeResult = await (deps?.upgrade ?? initiateProUpgrade)()
      const session = await (deps?.getSession ?? getAuthSession)()
      if (upgradeResult === null || !session?.user?.id) {
        return {
          ok: false,
          session: session ?? null,
          error: 'GitHub sign-in was cancelled or did not complete.',
        }
      }
      return { ok: true, session }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to initiate Pro upgrade',
      }
    }
  }

  return null
}

/**
 * Initiates Pro upgrade from content-script UIs where `chrome.identity` and `chrome.tabs`
 * are unavailable by delegating `INITIATE_PRO_UPGRADE` to the MV3 background service worker.
 */
export async function requestProUpgradeFromContentScript(): Promise<AuthRuntimeResponse> {
  const canRunLocally =
    typeof chrome !== 'undefined' &&
    Boolean(
      (chrome as unknown as { identity?: { launchWebAuthFlow?: unknown } }).identity
        ?.launchWebAuthFlow
    ) &&
    Boolean(chrome.tabs?.create)

  if (!canRunLocally && typeof chrome !== 'undefined' && typeof chrome.runtime?.sendMessage === 'function') {
    return new Promise<AuthRuntimeResponse>((resolve) => {
      let settled = false
      const settle = (result: AuthRuntimeResponse) => {
        if (!settled) {
          settled = true
          resolve(result)
        }
      }

      try {
        const maybePromise = chrome.runtime.sendMessage(
          { type: 'INITIATE_PRO_UPGRADE' },
          (response?: AuthRuntimeResponse) => {
            if (chrome.runtime?.lastError) {
              settle({ ok: false, error: chrome.runtime.lastError.message })
              return
            }
            settle(response ?? { ok: false, error: 'Empty response from background auth handler' })
          }
        ) as unknown

        if (maybePromise && typeof (maybePromise as Promise<unknown>).then === 'function') {
          ;(maybePromise as Promise<AuthRuntimeResponse>)
            .then((response) => {
              settle(response ?? { ok: false, error: 'Empty response from background auth handler' })
            })
            .catch((err) => {
              settle({
                ok: false,
                error: err instanceof Error ? err.message : 'Background auth request failed',
              })
            })
        }
      } catch (err) {
        settle({
          ok: false,
          error: err instanceof Error ? err.message : 'Background auth request failed',
        })
      }
    })
  }

  try {
    const upgradedSession = await initiateProUpgrade()
    if (!upgradedSession) {
      return {
        ok: false,
        session: null,
        error: 'GitHub sign-in was cancelled or did not complete.',
      }
    }
    const session = await getAuthSession()
    return { ok: true, session: session ?? upgradedSession }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to initiate Pro upgrade',
    }
  }
}
