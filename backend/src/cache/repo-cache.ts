import type { AnalysisResult, KVNamespace } from '../ai/types'

export type { KVNamespace } from '../ai/types'

const REPO_CACHE_TTL_SECONDS = 2592000

export function buildRepoCacheKey(owner: string, repo: string, commitSha: string): string {
  return `cache:repo:${owner.toLowerCase()}:${repo.toLowerCase()}:${commitSha}`
}

export function buildCanonicalRepoCacheKey(owner: string, repo: string): string {
  return `cache:repo:${owner.toLowerCase()}:${repo.toLowerCase()}`
}

export function buildLatestCommitKey(owner: string, repo: string): string {
  return `cache:repo-latest:${owner.toLowerCase()}:${repo.toLowerCase()}`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isValidAnalysisResult(value: unknown): value is AnalysisResult {
  if (!isPlainObject(value)) {
    return false
  }

  const { summary, architectureDiagram, deepAudit, providerUsed, tokensConsumed } = value
  if (!isPlainObject(summary) || !isPlainObject(deepAudit)) {
    return false
  }

  return (
    typeof summary.headline === 'string' &&
    typeof summary.whatItIs === 'string' &&
    typeof summary.whyItMatters === 'string' &&
    typeof summary.practicalUse === 'string' &&
    typeof summary.targetAudience === 'string' &&
    isStringArray(summary.stackPills) &&
    typeof architectureDiagram === 'string' &&
    isStringArray(deepAudit.strengths) &&
    isStringArray(deepAudit.concerns) &&
    typeof providerUsed === 'string' &&
    typeof tokensConsumed === 'number' &&
    Number.isFinite(tokensConsumed)
  )
}

/**
 * Reads a cached repository analysis from KV by normalized owner/repo and commit SHA.
 * First checks the exact commit key. If missed, falls back to the canonical repository-level
 * cache or latest commit pointer to prevent redundant AI invocations.
 * Returns null on cache miss, corrupt JSON, or schema mismatch.
 */
export async function getCachedAnalysis(
  owner: string,
  repo: string,
  commitSha: string,
  kv: KVNamespace
): Promise<AnalysisResult | null> {
  const commitKey = buildRepoCacheKey(owner, repo, commitSha)

  // 1. Exact commit SHA match
  const raw = await kv.get(commitKey)
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (isValidAnalysisResult(parsed)) {
        return parsed
      }
    } catch {
      // Corrupt JSON fallback
    }
  }

  // 2. Canonical repository-level cache (matches any branch, commit, or HEAD for this repo)
  const canonicalKey = buildCanonicalRepoCacheKey(owner, repo)
  const canonicalRaw = await kv.get(canonicalKey)
  if (canonicalRaw) {
    try {
      const parsed: unknown = JSON.parse(canonicalRaw)
      if (isValidAnalysisResult(parsed)) {
        // Alias this commit key for instant O(1) retrieval next time
        await kv.put(commitKey, canonicalRaw, { expirationTtl: REPO_CACHE_TTL_SECONDS }).catch(() => {})
        return parsed
      }
    } catch {
      // Fall through
    }
  }

  // 3. Fallback to latest analyzed commit pointer
  const latestSha = await getLatestCachedCommitSha(owner, repo, kv)
  if (latestSha && latestSha !== commitSha) {
    const latestRaw = await kv.get(buildRepoCacheKey(owner, repo, latestSha))
    if (latestRaw) {
      try {
        const parsed: unknown = JSON.parse(latestRaw)
        if (isValidAnalysisResult(parsed)) {
          await Promise.all([
            kv.put(commitKey, latestRaw, { expirationTtl: REPO_CACHE_TTL_SECONDS }).catch(() => {}),
            kv.put(canonicalKey, latestRaw, { expirationTtl: REPO_CACHE_TTL_SECONDS }).catch(() => {})
          ])
          return parsed
        }
      } catch {
        // Fall through
      }
    }
  }

  return null
}

/**
 * Writes a repository analysis result to KV with a 30-day TTL (2,592,000 seconds).
 * Updates both the specific commit key, the canonical repo key, and the latest commit pointer.
 */
export async function setCachedAnalysis(
  owner: string,
  repo: string,
  commitSha: string,
  data: AnalysisResult,
  kv: KVNamespace
): Promise<void> {
  const commitKey = buildRepoCacheKey(owner, repo, commitSha)
  const canonicalKey = buildCanonicalRepoCacheKey(owner, repo)
  const serialized = JSON.stringify(data)

  await Promise.all([
    kv.put(commitKey, serialized, {
      expirationTtl: REPO_CACHE_TTL_SECONDS
    }),
    kv.put(canonicalKey, serialized, {
      expirationTtl: REPO_CACHE_TTL_SECONDS
    }),
    setLatestCachedCommitSha(owner, repo, commitSha, kv)
  ])
}

/**
 * Deletes a cached repository analysis entry from KV (clears commit, canonical, and latest keys).
 */
export async function invalidateCachedAnalysis(
  owner: string,
  repo: string,
  commitSha: string,
  kv: KVNamespace
): Promise<void> {
  await Promise.all([
    kv.delete(buildRepoCacheKey(owner, repo, commitSha)),
    kv.delete(buildCanonicalRepoCacheKey(owner, repo)),
    kv.delete(buildLatestCommitKey(owner, repo))
  ])
}

/**
 * Reads the most recently analyzed commit SHA pointer for a repository.
 */
export async function getLatestCachedCommitSha(
  owner: string,
  repo: string,
  kv: KVNamespace
): Promise<string | null> {
  const sha = await kv.get(buildLatestCommitKey(owner, repo))
  return typeof sha === 'string' && sha.trim().length > 0 ? sha.trim() : null
}

/**
 * Records the latest analyzed commit SHA pointer for a repository (30-day TTL).
 */
export async function setLatestCachedCommitSha(
  owner: string,
  repo: string,
  commitSha: string,
  kv: KVNamespace
): Promise<void> {
  const trimmed = commitSha.trim()
  if (!trimmed) return
  await kv.put(buildLatestCommitKey(owner, repo), trimmed, {
    expirationTtl: REPO_CACHE_TTL_SECONDS
  })
}
