import type { AnalysisResult, KVNamespace } from '../ai/types'

export type { KVNamespace } from '../ai/types'

const REPO_CACHE_TTL_SECONDS = 2592000

function buildRepoCacheKey(owner: string, repo: string, commitSha: string): string {
  return `cache:repo:${owner.toLowerCase()}:${repo.toLowerCase()}:${commitSha}`
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
 * Returns null on cache miss, corrupt JSON, or schema mismatch.
 */
export async function getCachedAnalysis(
  owner: string,
  repo: string,
  commitSha: string,
  kv: KVNamespace
): Promise<AnalysisResult | null> {
  const raw = await kv.get(buildRepoCacheKey(owner, repo, commitSha))
  if (!raw) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isValidAnalysisResult(parsed)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/**
 * Writes a repository analysis result to KV with a 30-day TTL (2,592,000 seconds).
 */
export async function setCachedAnalysis(
  owner: string,
  repo: string,
  commitSha: string,
  data: AnalysisResult,
  kv: KVNamespace
): Promise<void> {
  await kv.put(buildRepoCacheKey(owner, repo, commitSha), JSON.stringify(data), {
    expirationTtl: REPO_CACHE_TTL_SECONDS
  })
}

/**
 * Deletes a cached repository analysis entry from KV.
 */
export async function invalidateCachedAnalysis(
  owner: string,
  repo: string,
  commitSha: string,
  kv: KVNamespace
): Promise<void> {
  await kv.delete(buildRepoCacheKey(owner, repo, commitSha))
}
