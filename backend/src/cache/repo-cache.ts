import type { AnalysisResult, KVNamespace } from '../ai/types'

export type { KVNamespace } from '../ai/types'

const REPO_CACHE_TTL_SECONDS = 2592000

function buildRepoCacheKey(owner: string, repo: string, commitSha: string): string {
  return `cache:repo:${owner.toLowerCase()}:${repo.toLowerCase()}:${commitSha}`
}

/**
 * Reads a cached repository analysis from KV by normalized owner/repo and commit SHA.
 * Returns null on cache miss or corrupt JSON.
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
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return parsed as AnalysisResult
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
