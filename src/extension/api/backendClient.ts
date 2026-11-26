import { getAuthSession, type AuthSession } from '../auth/supabaseAuth'

export interface AnalysisSummary {
  headline: string
  whatItIs: string
  whyItMatters: string
  practicalUse: string
  targetAudience: string
  stackPills: string[]
}

export interface FilteredAnalysisResult {
  summary: AnalysisSummary
  architectureDiagram?: string
  deepAudit?: {
    strengths: string[]
    concerns: string[]
  }
  providerUsed: string
  tokensConsumed: number
  cacheHit?: boolean
  remainingQuota?: number
}

export type ModuleAccessLevel = 'free' | 'pro' | 'disabled'

export interface FeedbackLocationsConfig {
  repo_explanation: boolean
  architecture: boolean
  file_explainer: boolean
  mascot: boolean
  overview: boolean
}

export const DEFAULT_FEEDBACK_LOCATIONS: FeedbackLocationsConfig = {
  repo_explanation: true,
  architecture: true,
  file_explainer: true,
  mascot: true,
  overview: true,
}

export interface CampaignBannerItem {
  id: string
  title: string
  message: string
  badge?: string
  targetTier: 'all' | 'free' | 'pro'
  ctaText: string
  ctaUrl: string
  couponCode?: string
  enabled: boolean
  priority?: number
}

export interface WhatsNewHighlight {
  id: string
  icon: string
  title: string
  description: string
}

export interface WhatsNewModalConfig {
  enabled: boolean
  version: string
  releaseDate: string
  title: string
  summary: string
  highlights: WhatsNewHighlight[]
  blogUrl?: string
  ctaText?: string
  ctaUrl?: string
}

export interface ExtensionReleaseConfig {
  minSupportedVersion: string
  latestVersion: string
  updateUrl: string
  forceUpdateNotice: boolean
  forceUpdateMessage?: string
  whatsNew: WhatsNewModalConfig
}

export type InAppNotificationType = 'info' | 'feature' | 'warning' | 'announcement' | 'tip'

export interface InAppNotificationItem {
  id: string
  title: string
  message: string
  type: InAppNotificationType
  targetTier: 'all' | 'free' | 'pro'
  actionUrl?: string
  actionLabel?: string
  pinned: boolean
  active: boolean
  createdAt: string
  expiresAt?: string
  readCount?: number
  clickCount?: number
}

export interface RemoteConfig {
  freeDailyLimit: number
  proDailyLimit: number
  featureFlags: {
    enableMascot: boolean
    enableDiagrams: boolean
    maintenanceMode: boolean
    bannerMessage?: string
  }
  feedbackLocations?: FeedbackLocationsConfig
  analysisModules?: Record<string, ModuleAccessLevel>
  campaignBanners?: CampaignBannerItem[]
  extensionRelease?: ExtensionReleaseConfig
  inAppNotifications?: InAppNotificationItem[]
}

export class BackendApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'BackendApiError'
    this.status = status
    this.code = code
  }
}

const CLIENT_ID_STORAGE_KEY = 'gpi_client_id'
const INTELLIGENCE_CACHE_STORAGE_KEY = 'gpi_intelligence_cache'
const DAILY_QUOTA_STORAGE_KEY = 'gpi_daily_quota_exceeded'
const DEFAULT_BACKEND_API_URL = 'https://github-intelligence-api.workers.dev'
const SAFE_COMMIT_REF_PATTERN = /^[A-Za-z0-9_.-]+$/
const MAX_LOCAL_INTELLIGENCE_ENTRIES = 50
const HEAD_CACHE_TTL_MS = 60 * 60 * 1000
const COMMIT_CACHE_TTL_MS = 24 * 60 * 60 * 1000

interface CachedIntelligenceEntry {
  data: FilteredAnalysisResult
  cachedAt: number
}

let memoryClientId: string | null = null
let memoryDailyQuotaDate: string | null = null
const memoryIntelligenceCache = new Map<string, CachedIntelligenceEntry>()
const inFlightIntelligenceRequests = new Map<string, Promise<FilteredAnalysisResult>>()

/**
 * Validates that a commit SHA or branch ref satisfies the backend's safe segment rule
 * (`^[A-Za-z0-9_.-]+$`, excluding `.` and `..`). Branch names containing slashes
 * (e.g. `feat/monetization`) safely fall back to `'HEAD'`.
 */
export function sanitizeCommitRef(candidate?: string | null): string {
  const trimmed = (candidate || '').trim()
  if (
    trimmed.length > 0 &&
    trimmed !== '.' &&
    !trimmed.includes('..') &&
    SAFE_COMMIT_REF_PATTERN.test(trimmed)
  ) {
    return trimmed
  }
  return 'HEAD'
}

export function getBackendBaseUrl(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    const configured = env?.VITE_BACKEND_API_URL?.trim()
    if (configured) {
      return configured.replace(/\/+$/, '')
    }
  } catch {
    // Fallback to default Edge Worker URL
  }
  return DEFAULT_BACKEND_API_URL
}

function getChromeStorageLocal(): chrome.storage.StorageArea | null {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return chrome.storage.local
  }
  return null
}

function createRandomUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

async function getOrCreateClientUuid(): Promise<string> {
  const storage = getChromeStorageLocal()
  if (storage) {
    const result = (await storage.get(CLIENT_ID_STORAGE_KEY)) as Record<string, unknown>
    const existing = result[CLIENT_ID_STORAGE_KEY]
    if (typeof existing === 'string' && existing.trim().length > 0) {
      return existing
    }
    const created = createRandomUuid()
    await storage.set({ [CLIENT_ID_STORAGE_KEY]: created })
    return created
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const existing = localStorage.getItem(CLIENT_ID_STORAGE_KEY)
      if (existing && existing.trim().length > 0) {
        return existing
      }
      const created = createRandomUuid()
      localStorage.setItem(CLIENT_ID_STORAGE_KEY, created)
      return created
    }
  } catch {
    // Fallback to in-memory UUID
  }

  if (!memoryClientId) {
    memoryClientId = createRandomUuid()
  }
  return memoryClientId
}

function collectCanvasFingerprint(): string {
  try {
    if (typeof document === 'undefined') return 'no-dom'
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 40
    const ctx = canvas.getContext('2d')
    if (!ctx) return 'no-2d'
    ctx.textBaseline = 'top'
    ctx.font = '14px sans-serif'
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(0, 0, 80, 20)
    ctx.fillStyle = '#06b6d4'
    ctx.fillText('gpi-fp-v1', 4, 4)
    return typeof canvas.toDataURL === 'function' ? canvas.toDataURL() : 'no-dataurl'
  } catch {
    return 'canvas-unavailable'
  }
}

async function sha256Hex(input: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (subtle && typeof subtle.digest === 'function') {
    const encoded = new TextEncoder().encode(input)
    const digest = await subtle.digest('SHA-256', encoded)
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  }

  // Deterministic 64-hex fallback only when WebCrypto subtle is unavailable
  let h1 = 0x811c9dc5
  let h2 = 0x9e3779b9
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ (ch + i), 0x85ebca6b) >>> 0
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`.repeat(4)
}

/**
 * Generates a deterministic 64-character SHA-256 client fingerprint signature
 * from device/browser attributes and a persisted local client UUID.
 */
export async function getClientSignature(): Promise<string> {
  const clientId = await getOrCreateClientUuid()
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : 'node'
  const locale = typeof navigator !== 'undefined' ? navigator.language || '' : 'en'
  const screenInfo =
    typeof screen !== 'undefined'
      ? `${screen.width}x${screen.height}x${screen.colorDepth}`
      : '0x0x0'
  const canvasFp = collectCanvasFingerprint()

  return sha256Hex(`${clientId}|${ua}|${locale}|${screenInfo}|${canvasFp}`)
}

async function parseErrorResponse(res: Response): Promise<BackendApiError> {
  let errJson: { error?: string; message?: string } = {}
  try {
    errJson = (await res.json()) as { error?: string; message?: string }
  } catch {
    errJson = {}
  }

  const message = errJson.message || `Backend request failed with status ${res.status}`
  return new BackendApiError(message, res.status, errJson.error)
}

export interface FetchRepoIntelligenceOptions {
  forceRefresh?: boolean
}

function buildIntelligenceCacheKey(
  owner: string,
  repo: string,
  commitSha: string,
  session: AuthSession | null
): string {
  const tier = session?.user?.id
    ? `${session.isPro ? 'pro' : 'free'}:${session.user.id}`
    : 'anon'
  return `${owner.toLowerCase()}/${repo.toLowerCase()}@${commitSha}:${tier}`
}

function isCacheEntryFresh(entry: CachedIntelligenceEntry | undefined, commitSha: string): boolean {
  if (!entry || !entry.data || typeof entry.cachedAt !== 'number') {
    return false
  }
  const ttl = commitSha === 'HEAD' ? HEAD_CACHE_TTL_MS : COMMIT_CACHE_TTL_MS
  return Date.now() - entry.cachedAt < ttl
}

async function readLocalIntelligenceCacheEntry(
  cacheKey: string,
  commitSha: string,
  owner?: string,
  repo?: string,
  tier?: string
): Promise<FilteredAnalysisResult | null> {
  const storage = getChromeStorageLocal()
  if (storage) {
    try {
      const stored = (await storage.get(INTELLIGENCE_CACHE_STORAGE_KEY)) as Record<string, unknown>
      const map = stored[INTELLIGENCE_CACHE_STORAGE_KEY] as
        | Record<string, CachedIntelligenceEntry>
        | undefined
      const entry = map?.[cacheKey]
      if (isCacheEntryFresh(entry, commitSha)) {
        return entry!.data
      }
      if (owner && repo && tier && map) {
        const prefix = `${owner.toLowerCase()}/${repo.toLowerCase()}@`
        const suffix = `:${tier}`
        for (const [k, v] of Object.entries(map)) {
          if (k.startsWith(prefix) && k.endsWith(suffix) && isCacheEntryFresh(v, 'HEAD')) {
            return v.data
          }
        }
      }
      return null
    } catch {
      return null
    }
  }

  const memEntry = memoryIntelligenceCache.get(cacheKey)
  if (isCacheEntryFresh(memEntry, commitSha)) {
    return memEntry!.data
  }
  if (owner && repo && tier) {
    const prefix = `${owner.toLowerCase()}/${repo.toLowerCase()}@`
    const suffix = `:${tier}`
    for (const [k, v] of memoryIntelligenceCache.entries()) {
      if (k.startsWith(prefix) && k.endsWith(suffix) && isCacheEntryFresh(v, 'HEAD')) {
        return v.data
      }
    }
  }
  return null
}

async function writeLocalIntelligenceCacheEntry(
  cacheKey: string,
  data: FilteredAnalysisResult
): Promise<void> {
  const entry: CachedIntelligenceEntry = { data, cachedAt: Date.now() }
  const storage = getChromeStorageLocal()
  if (storage) {
    try {
      const stored = (await storage.get(INTELLIGENCE_CACHE_STORAGE_KEY)) as Record<string, unknown>
      const rawMap = stored[INTELLIGENCE_CACHE_STORAGE_KEY]
      const map: Record<string, CachedIntelligenceEntry> =
        rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap)
          ? { ...(rawMap as Record<string, CachedIntelligenceEntry>) }
          : {}

      map[cacheKey] = entry
      const keys = Object.keys(map)
      if (keys.length > MAX_LOCAL_INTELLIGENCE_ENTRIES) {
        keys.sort((a, b) => (map[a]?.cachedAt ?? 0) - (map[b]?.cachedAt ?? 0))
        const toDelete = keys.slice(0, keys.length - MAX_LOCAL_INTELLIGENCE_ENTRIES)
        for (const k of toDelete) {
          delete map[k]
        }
      }

      await storage.set({ [INTELLIGENCE_CACHE_STORAGE_KEY]: map })
      return
    } catch {
      // Fall back silently if storage write fails
    }
  }

  memoryIntelligenceCache.set(cacheKey, entry)
  if (memoryIntelligenceCache.size > MAX_LOCAL_INTELLIGENCE_ENTRIES) {
    const oldestKey = memoryIntelligenceCache.keys().next().value
    if (oldestKey) memoryIntelligenceCache.delete(oldestKey)
  }
}

/**
 * Clears locally cached `/v1/analyze` responses (used on manual cache clear or tests).
 */
export async function clearLocalIntelligenceCache(): Promise<void> {
  memoryIntelligenceCache.clear()
  inFlightIntelligenceRequests.clear()
  memoryRemoteConfig = null
  const storage = getChromeStorageLocal()
  if (storage && typeof storage.remove === 'function') {
    try {
      await storage.remove(INTELLIGENCE_CACHE_STORAGE_KEY)
    } catch {
      // Ignore storage removal errors
    }
  }
}

export function getTodayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Checks whether the current user or client has already exhausted their daily free quota today.
 * Pro users are never treated as having exceeded the daily free quota.
 */
export async function isDailyQuotaExceeded(): Promise<boolean> {
  const session = await getAuthSession()
  if (session?.isPro) {
    return false
  }

  const today = getTodayUtcDateString()
  const storage = getChromeStorageLocal()
  if (storage) {
    try {
      const stored = (await storage.get(DAILY_QUOTA_STORAGE_KEY)) as Record<string, unknown>
      const dateVal = stored?.[DAILY_QUOTA_STORAGE_KEY]
      if (typeof dateVal === 'string' && dateVal === today) {
        return true
      }
      if (dateVal && dateVal !== today) {
        await storage.remove(DAILY_QUOTA_STORAGE_KEY)
      }
      return false
    } catch {
      // Fall through to memory/local fallback
    }
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const dateVal = localStorage.getItem(DAILY_QUOTA_STORAGE_KEY)
      if (dateVal === today) {
        return true
      }
      if (dateVal && dateVal !== today) {
        localStorage.removeItem(DAILY_QUOTA_STORAGE_KEY)
      }
      return false
    }
  } catch {
    // Ignore
  }

  return memoryDailyQuotaDate === today
}

/**
 * Marks that the daily free limit was reached for today (UTC).
 */
export async function markDailyQuotaExceeded(): Promise<void> {
  const today = getTodayUtcDateString()
  memoryDailyQuotaDate = today

  const storage = getChromeStorageLocal()
  if (storage) {
    try {
      await storage.set({ [DAILY_QUOTA_STORAGE_KEY]: today })
      return
    } catch {
      // Fallback
    }
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DAILY_QUOTA_STORAGE_KEY, today)
    }
  } catch {
    // Fallback
  }
}

/**
 * Clears the daily quota exceeded status (e.g. after purchasing or verifying Pro).
 */
export async function clearDailyQuotaExceeded(): Promise<void> {
  memoryDailyQuotaDate = null

  const storage = getChromeStorageLocal()
  if (storage) {
    try {
      await storage.remove(DAILY_QUOTA_STORAGE_KEY)
    } catch {
      // Ignore
    }
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(DAILY_QUOTA_STORAGE_KEY)
    }
  } catch {
    // Ignore
  }
}

/**
 * Fetches AI-generated repository intelligence from the Edge Worker `/v1/analyze` endpoint.
 * Shares a per-`owner/repo@commitSha:tier` local cache across mounts/tab switches (unless
 * `options.forceRefresh` is true), deduplicates concurrent requests, always includes
 * `X-Client-Signature`, includes `Authorization: Bearer <jwt>` when signed in, and never
 * transmits local GitHub PAT credentials.
 */
export async function fetchRepoIntelligence(
  owner: string,
  repo: string,
  commitSha: string,
  options?: FetchRepoIntelligenceOptions
): Promise<FilteredAnalysisResult> {
  const safeCommitSha = sanitizeCommitRef(commitSha)
  const session = await getAuthSession()
  const tier = session?.user?.id
    ? `${session.isPro ? 'pro' : 'free'}:${session.user.id}`
    : 'anon'
  const cacheKey = buildIntelligenceCacheKey(owner, repo, safeCommitSha, session)

  if (!options?.forceRefresh) {
    const cached = await readLocalIntelligenceCacheEntry(cacheKey, safeCommitSha, owner, repo, tier)
    if (cached) {
      // If current user is Pro, but cached data lacks architectureDiagram (e.g. cached prior to Pro upgrade), bypass cache
      const isProUser = Boolean(session?.isPro)
      if (isProUser && !cached.architectureDiagram) {
        // Stale stripped cache entry - proceed to fetch full Pro intelligence
      } else {
        return cached
      }
    }

    const existingInFlight = inFlightIntelligenceRequests.get(cacheKey)
    if (existingInFlight) {
      return existingInFlight
    }
  }

  const requestPromise = (async () => {
    const signature = await getClientSignature()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Client-Signature': signature,
    }

    if (session?.accessToken) {
      headers.Authorization = `Bearer ${session.accessToken}`
    }

    const bodyPayload: Record<string, unknown> = {
      owner,
      repo,
      commitSha: safeCommitSha,
    }
    if (options?.forceRefresh) {
      bodyPayload.forceRefresh = true
    }

    const res = await fetch(`${getBackendBaseUrl()}/v1/analyze`, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyPayload),
    })

    if (!res.ok) {
      const err = await parseErrorResponse(res)
      if (err.status === 429 || err.code === 'QUOTA_EXCEEDED') {
        void markDailyQuotaExceeded()
      }
      throw err
    }

    const result = (await res.json()) as FilteredAnalysisResult
    await writeLocalIntelligenceCacheEntry(cacheKey, result)
    return result
  })().finally(() => {
    if (inFlightIntelligenceRequests.get(cacheKey) === requestPromise) {
      inFlightIntelligenceRequests.delete(cacheKey)
    }
  })

  inFlightIntelligenceRequests.set(cacheKey, requestPromise)
  return requestPromise
}

let memoryRemoteConfig: { config: RemoteConfig; timestamp: number } | null = null
const REMOTE_CONFIG_TTL_MS = 30_000

/**
 * Fetches dynamic feature flags and quota limits from the Edge Worker `/v1/config` endpoint.
 * Caches in memory for 30 seconds unless options.forceRefresh is true.
 */
export async function fetchRemoteConfig(options?: { forceRefresh?: boolean }): Promise<RemoteConfig> {
  if (!options?.forceRefresh && memoryRemoteConfig && Date.now() - memoryRemoteConfig.timestamp < REMOTE_CONFIG_TTL_MS) {
    return memoryRemoteConfig.config
  }

  const res = await fetch(`${getBackendBaseUrl()}/v1/config`, {
    method: 'GET',
  })

  if (!res.ok) {
    throw await parseErrorResponse(res)
  }

  const raw = (await res.json()) as Record<string, unknown>
  const rawFlags = ((raw.featureFlags ?? raw.feature_flags) || {}) as Record<string, unknown>

  const freeDailyLimit = Number(raw.freeDailyLimit ?? raw.free_daily_limit ?? 15)
  const proDailyLimit = Number(raw.proDailyLimit ?? raw.pro_daily_limit ?? 250)

  const bannerMessageRaw = rawFlags.bannerMessage ?? rawFlags.banner_message

  const rawModules = (raw.analysisModules ?? raw.analysis_modules ?? {}) as Record<string, unknown>
  const analysisModules: Record<string, ModuleAccessLevel> = {}
  for (const [key, val] of Object.entries(rawModules)) {
    if (val === 'free' || val === 'pro' || val === 'disabled') {
      analysisModules[key] = val
    }
  }

  const rawLocs = ((raw.feedbackLocations ?? raw.feedback_locations) || {}) as Record<string, unknown>
  const feedbackLocations: FeedbackLocationsConfig = {
    repo_explanation: Boolean(rawLocs.repo_explanation ?? true),
    architecture: Boolean(rawLocs.architecture ?? true),
    file_explainer: Boolean(rawLocs.file_explainer ?? true),
    mascot: Boolean(rawLocs.mascot ?? true),
    overview: Boolean(rawLocs.overview ?? true),
  }

  const rawCampaigns = raw.campaign_banners ?? raw.campaignBanners
  let campaignBanners: CampaignBannerItem[] = []
  if (Array.isArray(rawCampaigns)) {
    campaignBanners = rawCampaigns as CampaignBannerItem[]
  } else if (rawCampaigns && typeof rawCampaigns === 'object' && Array.isArray((rawCampaigns as any).banners)) {
    campaignBanners = (rawCampaigns as any).banners as CampaignBannerItem[]
  }

  const rawRelease = (raw.extension_release ?? raw.extensionRelease) as Record<string, unknown> | undefined
  let extensionRelease: ExtensionReleaseConfig | undefined = undefined
  if (rawRelease && typeof rawRelease === 'object') {
    const rawWhatsNew = (rawRelease.whatsNew ?? rawRelease.whats_new ?? (rawRelease as any).whatsNewModal) as Record<string, unknown> | undefined

    let normalizedHighlights: WhatsNewHighlight[] = []
    if (Array.isArray(rawWhatsNew?.highlights)) {
      normalizedHighlights = rawWhatsNew.highlights.map((h: any, idx: number) => {
        if (typeof h === 'string') {
          return {
            id: `hl-${idx + 1}`,
            icon: 'sparkles',
            title: h,
            description: ''
          }
        }
        return {
          id: String(h?.id || `hl-${idx + 1}`),
          icon: String(h?.icon || 'sparkles'),
          title: String(h?.title || ''),
          description: String(h?.description || '')
        }
      })
    }

    extensionRelease = {
      minSupportedVersion: String(rawRelease.minSupportedVersion ?? rawRelease.min_supported_version ?? '1.2.0'),
      latestVersion: String(rawRelease.latestVersion ?? rawRelease.latest_version ?? '1.4.0'),
      updateUrl: String(rawRelease.updateUrl ?? rawRelease.update_url ?? (rawRelease as any).downloadUrl ?? ''),
      forceUpdateNotice: Boolean(
        rawRelease.forceUpdateNotice ?? rawRelease.force_update_notice ?? (rawRelease as any).forceUpdate ?? false
      ),
      forceUpdateMessage:
        typeof rawRelease.forceUpdateMessage === 'string'
          ? rawRelease.forceUpdateMessage
          : typeof (rawRelease as any).force_update_message === 'string'
            ? (rawRelease as any).force_update_message
            : undefined,
      whatsNew: {
        enabled: Boolean(rawWhatsNew?.enabled ?? true),
        version: String(rawWhatsNew?.version ?? rawRelease.latestVersion ?? rawRelease.latest_version ?? '1.4.0'),
        releaseDate: String(rawWhatsNew?.releaseDate ?? rawWhatsNew?.release_date ?? ''),
        title: String(rawWhatsNew?.title ?? "¡Novedades en GitHub Intelligence!"),
        summary: String(rawWhatsNew?.summary ?? rawWhatsNew?.description ?? ''),
        highlights: normalizedHighlights,
        blogUrl: typeof rawWhatsNew?.blogUrl === 'string' ? rawWhatsNew.blogUrl : undefined,
        ctaText:
          typeof rawWhatsNew?.ctaText === 'string'
            ? rawWhatsNew.ctaText
            : typeof (rawWhatsNew as any)?.actionButtonText === 'string'
              ? (rawWhatsNew as any).actionButtonText
              : undefined,
        ctaUrl:
          typeof rawWhatsNew?.ctaUrl === 'string'
            ? rawWhatsNew.ctaUrl
            : typeof (rawWhatsNew as any)?.actionButtonUrl === 'string'
              ? (rawWhatsNew as any).actionButtonUrl
              : undefined,
      }
    }
  }

  const rawNotifs = raw.in_app_notifications ?? raw.inAppNotifications
  let inAppNotifications: InAppNotificationItem[] = []
  const rawNotifList = Array.isArray(rawNotifs)
    ? rawNotifs
    : rawNotifs && typeof rawNotifs === 'object' && Array.isArray((rawNotifs as any).notifications)
      ? (rawNotifs as any).notifications
      : []

  if (rawNotifList.length > 0) {
    inAppNotifications = rawNotifList.map((item: any, idx: number) => ({
      id: String(item.id || `notif-${idx + 1}`),
      title: String(item.title || ''),
      message: String(item.message || ''),
      type: (item.type || 'info') as InAppNotificationType,
      targetTier: (item.targetTier || 'all') as 'all' | 'free' | 'pro',
      actionUrl: item.actionUrl || item.action_url || '',
      actionLabel: item.actionLabel || item.actionText || item.action_label || '',
      pinned: Boolean(item.pinned),
      active: item.active !== false && item.enabled !== false,
      createdAt: String(item.createdAt || item.created_at || ''),
      expiresAt: item.expiresAt || item.expires_at || undefined,
      readCount: Number(item.readCount || 0),
      clickCount: Number(item.clickCount || 0)
    }))
  }

  const config: RemoteConfig = {
    freeDailyLimit: Number.isFinite(freeDailyLimit) ? freeDailyLimit : 15,
    proDailyLimit: Number.isFinite(proDailyLimit) ? proDailyLimit : 250,
    featureFlags: {
      enableMascot: Boolean(rawFlags.enableMascot ?? rawFlags.mascot_enabled ?? true),
      enableDiagrams: Boolean(rawFlags.enableDiagrams ?? rawFlags.diagrams_enabled ?? true),
      maintenanceMode: Boolean(rawFlags.maintenanceMode ?? rawFlags.maintenance_mode ?? false),
      ...(typeof bannerMessageRaw === 'string' && bannerMessageRaw.length > 0
        ? { bannerMessage: bannerMessageRaw }
        : {}),
    },
    feedbackLocations,
    analysisModules,
    campaignBanners,
    extensionRelease,
    inAppNotifications,
  }

  memoryRemoteConfig = { config, timestamp: Date.now() }
  return config
}

/**
 * Checks whether the feedback widget should appear in a given section based on remote config.
 */
export function isFeedbackLocationEnabled(
  config: RemoteConfig | null,
  location: keyof FeedbackLocationsConfig
): boolean {
  if (!config || !config.feedbackLocations) return true
  return config.feedbackLocations[location] !== false
}

/**
 * Resolves the configured access tier for an analysis module ('free' | 'pro' | 'disabled').
 */
export function getModuleAccess(
  config: RemoteConfig | null,
  moduleId: string,
  defaultAccess: ModuleAccessLevel = 'free'
): ModuleAccessLevel {
  if (!config?.analysisModules) return defaultAccess
  return config.analysisModules[moduleId] ?? defaultAccess
}

export interface MascotChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface MascotRepoContext {
  owner: string
  repo: string
  commitSha?: string
}

export interface StreamMascotChatParams {
  messages: MascotChatMessage[]
  repoContext: MascotRepoContext
  onDelta: (delta: string) => void
  signal?: AbortSignal
}

/**
 * Consumes a `text/event-stream` byte stream, buffering partial lines across
 * arbitrary network chunks and invoking `onDelta` for each `{ delta }` frame.
 */
export async function consumeSseDeltaStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (delta: string) => void
): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let fullText = ''

  const processLine = (rawLine: string) => {
    const trimmed = rawLine.trim()
    if (!trimmed.startsWith('data:')) return
    const payload = trimmed.slice(5).trim()
    if (!payload || payload === '[DONE]') return
    try {
      const parsed = JSON.parse(payload) as { delta?: unknown }
      if (typeof parsed?.delta === 'string' && parsed.delta.length > 0) {
        fullText += parsed.delta
        onDelta(parsed.delta)
      }
    } catch {
      // Ignore malformed SSE frame
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) {
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          processLine(line)
        }
      }
    }

    buffer += decoder.decode()
    if (buffer.length > 0) {
      for (const line of buffer.split(/\r?\n/)) {
        processLine(line)
      }
    }
  } finally {
    reader.releaseLock()
  }

  return fullText
}

/**
 * Streams a Pro Mascot chat reply from `/v1/mascot/chat` via Server-Sent Events (SSE).
 * Includes `Authorization: Bearer <jwt>` and `X-Client-Signature`, and parses chunked SSE deltas.
 */
export async function streamMascotChat(params: StreamMascotChatParams): Promise<string> {
  const [signature, session] = await Promise.all([getClientSignature(), getAuthSession()])

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-Signature': signature,
  }

  if (session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`
  }

  const safeCommitSha = params.repoContext.commitSha
    ? sanitizeCommitRef(params.repoContext.commitSha)
    : undefined

  const res = await fetch(`${getBackendBaseUrl()}/v1/mascot/chat`, {
    method: 'POST',
    headers,
    signal: params.signal,
    body: JSON.stringify({
      messages: params.messages,
      repoContext: {
        owner: params.repoContext.owner,
        repo: params.repoContext.repo,
        ...(safeCommitSha ? { commitSha: safeCommitSha } : {}),
      },
    }),
  })

  if (!res.ok) {
    throw await parseErrorResponse(res)
  }

  if (!res.body) {
    throw new BackendApiError('Empty mascot response stream', 502, 'STREAM_UNAVAILABLE')
  }

  return consumeSseDeltaStream(res.body, params.onDelta)
}

export interface ExplainFileParams {
  owner: string
  repo: string
  path: string
  ref?: string
  fileSnippet?: string
  locale?: string
}

export interface ExplainFileResponse {
  explanation: {
    summary: string
    keyResponsibilities: string[]
    architectureRole: string
  }
  remainingToday: number
  isPro?: boolean
  providerUsed?: string
}

/**
 * Calls the backend `/v1/file/explain` endpoint to generate an AI explanation for an individual file.
 * Automatically checks and deducts daily quota (Free or Pro limits from backend configuration).
 */
export async function explainFileViaBackend(
  params: ExplainFileParams
): Promise<ExplainFileResponse> {
  const [signature, session] = await Promise.all([getClientSignature(), getAuthSession()])

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-Signature': signature,
  }

  if (session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`
  }

  const res = await fetch(`${getBackendBaseUrl()}/v1/file/explain`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  })

  if (!res.ok) {
    const err = await parseErrorResponse(res)
    if (
      err.status === 429 ||
      err.code === 'QUOTA_EXCEEDED' ||
      err.code === 'PRO_QUOTA_EXHAUSTED' ||
      err.code === 'FREE_QUOTA_EXHAUSTED'
    ) {
      void markDailyQuotaExceeded()
    }
    throw err
  }

  return (await res.json()) as ExplainFileResponse
}

export interface SubmitFeedbackParams {
  repo: string
  rating: 'positive' | 'negative'
  category?: 'accuracy' | 'diagram' | 'mascot' | 'speed' | 'general'
  location?: string
  comment?: string
  provider?: string
}

export interface SubmitFeedbackResponse {
  success: boolean
  id: string
}

/**
 * Submits user satisfaction and feedback (rating, category, and optional comment)
 * directly to the backend /v1/feedback endpoint.
 */
export async function submitUserFeedback(
  params: SubmitFeedbackParams
): Promise<SubmitFeedbackResponse> {
  const [signature, session] = await Promise.all([getClientSignature(), getAuthSession()])

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-Signature': signature,
  }

  if (session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`
  }

  const res = await fetch(`${getBackendBaseUrl()}/v1/feedback`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  })

  if (!res.ok) {
    throw await parseErrorResponse(res)
  }

  return (await res.json()) as SubmitFeedbackResponse
}


