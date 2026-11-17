import { getAuthSession } from '../auth/supabaseAuth'

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
const DEFAULT_BACKEND_API_URL = 'https://github-intelligence-api.workers.dev'

let memoryClientId: string | null = null

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

/**
 * Fetches AI-generated repository intelligence from the Edge Worker `/v1/analyze` endpoint.
 * Always includes `X-Client-Signature`, includes `Authorization: Bearer <jwt>` when signed in,
 * and never transmits local GitHub PAT credentials.
 */
export async function fetchRepoIntelligence(
  owner: string,
  repo: string,
  commitSha: string
): Promise<FilteredAnalysisResult> {
  const [signature, session] = await Promise.all([getClientSignature(), getAuthSession()])

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
    body: JSON.stringify({ owner, repo, commitSha }),
  })

  if (!res.ok) {
    throw await parseErrorResponse(res)
  }

  return (await res.json()) as FilteredAnalysisResult
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
