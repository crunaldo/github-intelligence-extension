import type { TreeEntry } from '../../features/repository/types'
import { isSupportedGitHubHost } from '../content'

export interface ActivePathInfo {
  type: 'blob' | 'tree' | 'root'
  path: string
  branch?: string
}

/**
 * Extracts the currently explored repository path and ref/branch from a GitHub URL.
 * e.g. https://github.com/owner/repo/blob/main/src/index.ts -> { type: 'blob', branch: 'main', path: 'src/index.ts' }
 *      https://github.com/owner/repo/tree/v1.0.0/src -> { type: 'tree', branch: 'v1.0.0', path: 'src' }
 */
export function extractActivePathFromUrl(urlStr: string, customDomains?: string): ActivePathInfo {
  try {
    const url = new URL(urlStr)
    if (!isSupportedGitHubHost(url.hostname, customDomains)) {
      return { type: 'root', path: '' }
    }

    const parts = url.pathname.split('/').filter(Boolean)
    // parts[0] = owner, parts[1] = repo
    if (parts.length >= 4 && (parts[2] === 'blob' || parts[2] === 'tree')) {
      const type = parts[2] as 'blob' | 'tree'
      const branch = parts[3]
      const path = parts.slice(4).join('/')
      return { type, branch, path }
    }
  } catch {
    // Fallback for relative or malformed URLs
  }
  return { type: 'root', path: '' }
}

/**
 * Computes all ancestor folder paths for a given file or folder path.
 * e.g. "packages/react/src/React.js" -> ["packages", "packages/react", "packages/react/src"]
 */
export function getAncestorPaths(filePath: string): string[] {
  if (!filePath) return []
  const segments = filePath.split('/').filter(Boolean)
  if (segments.length <= 1) return []

  const ancestors: string[] = []
  for (let i = 1; i < segments.length; i++) {
    ancestors.push(segments.slice(0, i).join('/'))
  }
  return ancestors
}

const DEFAULT_OPEN_FOLDERS: Record<string, boolean> = {
  src: true,
  app: true,
  lib: true,
}

function getStorageKey(owner: string, repo: string): string {
  return `gpi_tree_folders_${owner.toLowerCase()}_${repo.toLowerCase()}`
}

/**
 * Persists user's open/collapsed folder state across navigations and page reloads.
 */
export function saveOpenFolders(
  owner: string,
  repo: string,
  folders: Record<string, boolean>
): void {
  try {
    const key = getStorageKey(owner, repo)
    const json = JSON.stringify(folders)
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(key, json)
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, json)
    }
  } catch {}
}

/**
 * Loads saved folder state for a repository.
 */
export function loadOpenFolders(owner: string, repo: string): Record<string, boolean> {
  try {
    const key = getStorageKey(owner, repo)
    let json: string | null = null
    if (typeof sessionStorage !== 'undefined') {
      json = sessionStorage.getItem(key)
    }
    if (!json && typeof localStorage !== 'undefined') {
      json = localStorage.getItem(key)
    }
    if (json) {
      const parsed = JSON.parse(json)
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, boolean>
      }
    }
  } catch {}
  return { ...DEFAULT_OPEN_FOLDERS }
}

/**
 * Auto-expands all ancestor folders of the active path, preserving existing folder states.
 */
export function mergeActiveAncestors(
  openFolders: Record<string, boolean>,
  activePath: string
): Record<string, boolean> {
  const ancestors = getAncestorPaths(activePath)
  if (ancestors.length === 0) return openFolders

  let changed = false
  const next = { ...openFolders }
  for (const ancestor of ancestors) {
    if (!next[ancestor]) {
      next[ancestor] = true
      changed = true
    }
  }
  return changed ? next : openFolders
}

/**
 * Fetches recursive repository git tree from GitHub REST API (lightweight lazy loader).
 */
export async function fetchRepoGitTree(
  owner: string,
  repo: string,
  ref = 'main',
  token?: string,
  customDomains?: string
): Promise<TreeEntry[]> {
  try {
    const isEnterprise =
      customDomains &&
      typeof window !== 'undefined' &&
      isSupportedGitHubHost(window.location.hostname, customDomains) &&
      window.location.hostname.toLowerCase() !== 'github.com' &&
      window.location.hostname.toLowerCase() !== 'www.github.com'

    const apiBase = isEnterprise
      ? `https://${window.location.hostname}/api/v3`
      : 'https://api.github.com'

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    }
    if (token) {
      headers['Authorization'] = `token ${token}`
    }

    const url = `${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
      repo
    )}/git/trees/${encodeURIComponent(ref)}?recursive=1`

    const res = await fetch(url, { headers })
    if (!res.ok) {
      return []
    }

    const data = (await res.json()) as {
      tree?: Array<{ path: string; type: string; size?: number; sha: string; url: string }>
    }

    if (Array.isArray(data?.tree)) {
      return data.tree
        .filter((item) => item.type === 'blob' || item.type === 'tree')
        .map((item) => ({
          path: item.path,
          type: item.type as 'blob' | 'tree',
          size: item.size || null,
          sha: item.sha,
          url: item.url,
        }))
    }
  } catch {}
  return []
}
