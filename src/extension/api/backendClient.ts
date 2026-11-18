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

export interface RemoteConfig {
  freeDailyLimit: number
  proDailyLimit: number
  featureFlags: {
    enableMascot: boolean
    enableDiagrams: boolean
    maintenanceMode: boolean
    bannerMessage?: string
  }
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
  commitSha: string
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
      return null
    } catch {
      return null
    }
  }

  const memEntry = memoryIntelligenceCache.get(cacheKey)
  return isCacheEntryFresh(memEntry, commitSha) ? memEntry!.data : null
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
  const storage = getChromeStorageLocal()
  if (storage && typeof storage.remove === 'function') {
    try {
      await storage.remove(INTELLIGENCE_CACHE_STORAGE_KEY)
    } catch {
      // Ignore storage removal errors
    }
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
  const cacheKey = buildIntelligenceCacheKey(owner, repo, safeCommitSha, session)

  if (!options?.forceRefresh) {
    const cached = await readLocalIntelligenceCacheEntry(cacheKey, safeCommitSha)
    if (cached) {
      return cached
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

    const res = await fetch(`${getBackendBaseUrl()}/v1/analyze`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ owner, repo, commitSha: safeCommitSha }),
    })

    if (!res.ok) {
      throw await parseErrorResponse(res)
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

/**
 * Fetches dynamic feature flags and quota limits from the Edge Worker `/v1/config` endpoint.
 */
export async function fetchRemoteConfig(): Promise<RemoteConfig> {
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

  return {
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
  }
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
