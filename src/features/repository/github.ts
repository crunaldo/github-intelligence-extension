import type {
  Dependency,
  EvidenceSource,
  GitHubTarget,
  LatestCommit,
  LatestRelease,
  ManifestSummary,
  RepositoryMetadata,
  RepositoryReport,
  RuntimeRequirement,
  TreeEntry,
} from './types'

const API_BASE = 'https://api.github.com'
const MAX_TREE_ITEMS = 8_000
const MAX_MANIFEST_BYTES = 256_000
const MAX_MANIFESTS = 8
const MAX_README_CHARACTERS = 20_000
const apiCache = new Map<string, { etag: string | null; lastModified: string | null; data: unknown }>()

export class GitHubApiError extends Error {
  status: number
  rateLimitRemaining: number | null
  rateLimitReset: string | null

  constructor(message: string, status: number, remaining: number | null, reset: string | null) {
    super(message)
    this.name = 'GitHubApiError'
    this.status = status
    this.rateLimitRemaining = remaining
    this.rateLimitReset = reset
  }
}

export type AnalysisStage = 'metadata' | 'tree' | 'readme' | 'languages' | 'commit' | 'release' | 'manifests'
export type AnalysisProgress = { stage: AnalysisStage; state: 'queued' | 'active' | 'complete' | 'unavailable' }

type ApiResult<T> = {
  data: T
  url: string
  etag: string | null
}

type RepositoryApi = {
  id: number
  full_name: string
  name: string
  description: string | null
  html_url: string
  homepage: string | null
  created_at: string
  updated_at: string
  pushed_at: string | null
  default_branch: string
  stargazers_count: number
  forks_count: number
  watchers_count: number
  open_issues_count: number
  size: number
  archived: boolean
  disabled: boolean
  topics?: string[]
  license: { name: string; spdx_id: string | null; url: string | null } | null
}

type TreeApi = { tree: Array<{ path: string; type: string; size?: number; sha: string; url: string }>; truncated: boolean }
type ReadmeApi = { path: string; html_url: string; content?: string; encoding?: string; size?: number }
type CommitApi = { sha: string; html_url: string; commit: { message: string; committer?: { date?: string } | null } }
type ReleaseApi = {
  name: string | null
  tag_name: string
  published_at: string | null
  html_url: string
  assets: Array<{ name: string; size: number; browser_download_url: string; content_type: string | null }>
}
type ContentApi = { content?: string; encoding?: string; size?: number; html_url?: string; download_url?: string }

let latestRateLimit: { remaining: number | null; resetAt: string | null } = { remaining: null, resetAt: null }
let configuredGitHubToken: string | null = null

export function setConfiguredGitHubToken(token: string | null): void {
  configuredGitHubToken = token && token.trim() ? token.trim() : null
}

export function getConfiguredGitHubToken(): string | null {
  return configuredGitHubToken
}

export function getLatestRateLimit(): { remaining: number | null; resetAt: string | null } {
  return latestRateLimit
}

/**
 * Unwraps social media tracking redirect URLs (Facebook Link Shim l.facebook.com/l.php?u=...,
 * Reddit out.reddit.com, Google url?q=..., YouTube redirect?q=..., and cleans tracking parameters like ?fbclid=...).
 */
export function unwrapSocialRedirectUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return ''
  let current = rawUrl.trim()

  // 1. Strip wrapping quotes, brackets, or angle brackets
  current = current.replace(/^["'`([{<]+|[>"')\]}.,;:!?]+$/g, '').trim()

  // 2. Decode redirects from Facebook (l.facebook.com, lm.facebook.com), Google (/url), Reddit (out.reddit.com), etc.
  for (let i = 0; i < 3; i++) {
    try {
      const looksLikeHttpUrl = current.startsWith('http://') || current.startsWith('https://')
      if (!looksLikeHttpUrl && !current.includes('.')) {
        break
      }

      const urlToParse = looksLikeHttpUrl ? current : `https://${current}`
      const parsed = new URL(urlToParse)
      const host = parsed.hostname.toLowerCase()
      const path = parsed.pathname.toLowerCase()

      // Do not unwrap redirects out of github.com itself (e.g. /login?return_to=...)
      if (host === 'github.com' || host === 'www.github.com') {
        break
      }

      const isKnownRedirectEndpoint =
        host === 'l.facebook.com' ||
        host === 'lm.facebook.com' ||
        host === 'l.instagram.com' ||
        host === 'out.reddit.com' ||
        host === 'l.messenger.com' ||
        ((host === 'facebook.com' || host.endsWith('.facebook.com')) && (path.includes('/l.php') || path.includes('linkshim'))) ||
        ((host.startsWith('google.') || host.includes('.google.')) && path === '/url') ||
        ((host === 'youtube.com' || host.endsWith('.youtube.com')) && path === '/redirect') ||
        ((host === 'linkedin.com' || host.endsWith('.linkedin.com')) && path.includes('/redir')) ||
        path.includes('/redirect') ||
        path.endsWith('/l.php') ||
        path.includes('/linkshim')

      if (isKnownRedirectEndpoint && parsed.search) {
        const redirected = parsed.searchParams.get('u') ||
                           parsed.searchParams.get('url') ||
                           parsed.searchParams.get('q') ||
                           parsed.searchParams.get('target') ||
                           parsed.searchParams.get('dest') ||
                           parsed.searchParams.get('link') ||
                           parsed.searchParams.get('redirect_to') ||
                           parsed.searchParams.get('next')

        if (redirected) {
          const trimmed = redirected.trim()
          // Only unwrap if the parameter value itself looks like a URL (prevents treating search queries like ?q=ui/ux as paths)
          if (/^(?:https?:\/\/|https?%3A%2F%2F|(?:www\.)?github\.com\/)/i.test(trimmed)) {
            current = trimmed
            if (current.includes('%2F') || current.includes('%3A') || current.includes('%2f') || current.includes('%3a')) {
              try {
                current = decodeURIComponent(current)
              } catch {
                // Keep partially decoded value
              }
            }
            continue
          }
        }
      }

      // Regex fallback for malformed l.facebook.com / l.instagram.com shims
      if (isKnownRedirectEndpoint) {
        const uParamMatch = current.match(/[?&]u=([^&]+)/i)
        if (uParamMatch) {
          try {
            const extracted = decodeURIComponent(uParamMatch[1]).trim()
            if (extracted && extracted !== current && /^(?:https?:\/\/|(?:www\.)?github\.com\/)/i.test(extracted)) {
              current = extracted
              continue
            }
          } catch {
            // Ignore
          }
        }
      }

      break
    } catch {
      break
    }
  }

  // 3. Strip common social tracking query params (e.g. fbclid, utm_*, ref_src) on GitHub URLs
  try {
    if (current.includes('?') && (current.startsWith('http://') || current.startsWith('https://'))) {
      const u = new URL(current)
      const host = u.hostname.toLowerCase()
      if (host === 'github.com' || host === 'www.github.com') {
        const paramsToClean = [
          'fbclid', 'gclid', 'ref', 'ref_src',
          'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
          'h', 's', '__tn__', '__cft__', 'mibextid', 'rdid', 'ved', 'ei'
        ]
        paramsToClean.forEach((param) => {
          u.searchParams.delete(param)
          for (const key of Array.from(u.searchParams.keys())) {
            if (key.startsWith(param)) {
              u.searchParams.delete(key)
            }
          }
        })
        const cleanSearch = u.searchParams.toString()
        current = `${u.origin}${u.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${u.hash}`
      }
    }
  } catch {
    // Ignore
  }

  return current
}

export function parseGitHubUrl(value: string | GitHubTarget, options?: { relaxed?: boolean }): GitHubTarget {
  if (typeof value !== 'string') {
    if (value && typeof value === 'object' && 'owner' in value && 'repository' in value) {
      return value as GitHubTarget
    }
    throw new Error('Enter a complete GitHub repository URL, such as https://github.com/owner/repository.')
  }

  let input = value.trim()
  const relaxed = options?.relaxed ?? false

  // Always unwrap social redirects or encoded wrappers if present
  if (input.includes('facebook.com') || input.includes('l.php') || input.includes('out.reddit.com') || input.includes('google.') || input.includes('%2F') || input.includes('%2f')) {
    input = unwrapSocialRedirectUrl(input)
  }

  if (relaxed) {
    // Unwrap any social media tracking link wrappers first (e.g. Facebook l.facebook.com, Reddit, Google)
    input = unwrapSocialRedirectUrl(input)

    // Strip wrapping quotes, brackets, parens, backticks, or trailing punctuation
    input = input.replace(/^["'`([{<]+|[>"')\]}.,;:!?]+$/g, '').trim()

    // Handle SSH clone format git@github.com:owner/repo.git
    if (input.startsWith('git@github.com:')) {
      input = `https://github.com/${input.slice('git@github.com:'.length)}`
    }

    // Handle social prefixes: github/owner/repo, gh/owner/repo, github:owner/repo, gh:owner/repo
    input = input.replace(/^(?:github|gh)[:/]/i, 'github.com/')

    // Handle @owner/repo
    if (input.startsWith('@')) {
      input = input.slice(1)
    }

    if (!input.startsWith('http://') && !input.startsWith('https://')) {
      if (input.startsWith('github.com/')) {
        input = `https://${input}`
      } else if (/^[\w.-]+\/[\w.-]+/.test(input)) {
        input = `https://github.com/${input}`
      }
    }
  }

  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    throw new Error('Enter a complete GitHub repository URL, such as https://github.com/owner/repository.')
  }

  if (relaxed) {
    if (parsed.protocol === 'http:' && (parsed.hostname.toLowerCase() === 'github.com' || parsed.hostname.toLowerCase() === 'www.github.com')) {
      parsed.protocol = 'https:'
    }
    if (parsed.hostname.toLowerCase() === 'www.github.com') {
      parsed.hostname = 'github.com'
    }
  }

  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com' || parsed.port || parsed.username || parsed.password) {
    throw new Error('Only public repositories hosted at https://github.com are supported right now.')
  }

  if (!relaxed && (parsed.search || parsed.hash)) {
    throw new Error('Remove query parameters and fragments from the repository link, then try again.')
  }

  const parts = parsed.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part))
  if (parts.length < 2) {
    throw new Error('The URL must include both the GitHub owner and repository name.')
  }

  const [owner, rawRepository, route, ...refParts] = parts
  const repository = rawRepository.replace(/\.git$/i, '')
  const validSegment = /^[\w.-]{1,100}$/
  if (!validSegment.test(owner) || !validSegment.test(repository) || owner === '.' || owner === '..' || repository === '.' || repository === '..') {
    throw new Error('The GitHub owner or repository name contains unsupported characters.')
  }

  let refKind: GitHubTarget['refKind'] = 'default'
  let ref: string | undefined
  if (route === 'tree' || route === 'commit') {
    ref = refParts.join('/')
    if (!ref || ref.length > 250 || ref.includes('..') || ref.includes('\\')) {
      throw new Error(`The ${route} link does not contain a valid ${route === 'tree' ? 'branch or tag' : 'commit'}.`)
    }
    refKind = route === 'tree' ? 'branch' : 'commit'
  } else if (relaxed && route === 'blob' && refParts.length > 0) {
    ref = refParts[0]
    refKind = 'branch'
  } else if (relaxed && route) {
    ref = undefined
    refKind = 'default'
  } else if (route) {
    throw new Error('Use a repository, branch, or commit URL from github.com.')
  }

  return {
    owner,
    repository,
    ref,
    refKind,
    originalUrl: `https://github.com/${owner}/${repository}${ref ? `/${refKind === 'branch' ? 'tree' : 'commit'}/${ref}` : ''}`,
  }
}

export function parseFlexibleGitHubUrl(value: string): GitHubTarget {
  return parseGitHubUrl(value, { relaxed: true })
}

export const RESERVED_GITHUB_NAMES = new Set([
  'about', 'account', 'actions', 'advisories', 'api', 'apps', 'assets', 'blog',
  'blob', 'branches', 'codespaces', 'collections', 'commit', 'commits', 'community',
  'contact', 'copilot', 'customer-stories', 'dashboard', 'developers', 'discussions',
  'edit', 'education', 'enterprise', 'events', 'explore', 'features', 'git',
  'git-guides', 'github-copilot', 'graphs', 'help', 'images', 'issues', 'join',
  'license', 'login', 'logout', 'marketplace', 'network', 'new', 'nonprofit',
  'notifications', 'organizations', 'orgs', 'partners', 'pricing', 'projects',
  'pull', 'pulls', 'raw', 'readme', 'releases', 'resources', 'search', 'security',
  'services', 'sessions', 'settings', 'shop', 'signup', 'site', 'solutions',
  'sponsors', 'stars', 'status', 'support', 'tags', 'team', 'topics', 'trending',
  'users', 'watch', 'why-github', 'wiki'
])

export const FALSE_POSITIVE_SLASH_PAIRS = new Set([
  'and/or', 'y/o', 'true/false', 'false/true', 'yes/no', 'si/no', 'in/out',
  'input/output', 'on/off', 'up/down', 'left/right', 'high/low', 'min/max',
  'before/after', 'am/pm', 'km/h', 'mph', 'w/o', 'c/u', 's/n', 'n/a', 'etc/passwd',
  'text/html', 'text/plain', 'text/css', 'text/javascript', 'application/json',
  'application/xml', 'image/png', 'image/jpeg', 'image/svg+xml',
  'ui/ux', 'ci/cd', 'ai/ml', 'b2b/b2c', 'html/css', 'ios/android', 'pc/mac',
  'read/write', 'qa/qc', 'v1/v2', 'http/2', 'http/1.1', 'tcp/ip', 'utf/8'
])

export function isValidGitHubOwnerAndRepo(owner: string, repo: string): boolean {
  if (!owner || !repo) return false
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(owner)) return false
  if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(repo) || repo === '.' || repo === '..') return false
  if (RESERVED_GITHUB_NAMES.has(owner.toLowerCase())) return false
  if (FALSE_POSITIVE_SLASH_PAIRS.has(`${owner}/${repo}`.toLowerCase())) return false
  return true
}

function safeDecodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

export interface ExtractRepoFromUrlOptions {
  isGitHubSite?: boolean
}

/**
 * Strictly extracts a GitHub repository target only from genuine github.com / www.github.com URLs.
 * Rejects GitHub subdomains (docs.github.com, gist.github.com, etc.), non-GitHub hosts,
 * and non-repository paths (/issues, /pulls, /blob on GitHub itself, etc.).
 */
export function extractRepoFromUrl(rawUrl: string, options?: ExtractRepoFromUrlOptions): GitHubTarget | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null
  let normalized = rawUrl.trim()
  if (/^(?:www\.)?github\.com\//i.test(normalized)) {
    normalized = `https://${normalized}`
  }

  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (parsed.port || parsed.username || parsed.password) return null

  const host = parsed.hostname.toLowerCase()
  if (host !== 'github.com' && host !== 'www.github.com') return null

  const parts = parsed.pathname.split('/').filter(Boolean).map(safeDecodeSegment)
  if (parts.length < 2) return null

  const owner = parts[0]
  const repo = parts[1].replace(/\.git$/i, '')
  if (!isValidGitHubOwnerAndRepo(owner, repo)) return null

  const isGitHubSite = options?.isGitHubSite ?? false

  if (parts.length === 2) {
    if (isGitHubSite && parsed.searchParams.has('tab')) {
      return null
    }
    return {
      owner,
      repository: repo,
      refKind: 'default',
      originalUrl: `https://github.com/${owner}/${repo}`,
    }
  }

  const route = parts[2]
  if (isGitHubSite) {
    // On github.com itself, ignore file trees (/blob/), nested folder paths (/tree/main/src), issues, PRs, etc.
    if (parts.length === 4 && route === 'tree') {
      const ref = parts[3]
      return {
        owner,
        repository: repo,
        ref,
        refKind: 'branch',
        originalUrl: `https://github.com/${owner}/${repo}/tree/${ref}`,
      }
    }
    return null
  }

  // On external sites, allow explicit tree/blob/commit/releases links to resolve to the repository
  if (parts.length >= 4 && (route === 'tree' || route === 'blob' || route === 'commit')) {
    const ref = route === 'tree' ? parts.slice(3).join('/') : parts[3]
    if (!ref || ref.includes('..') || ref.includes('\\')) return null
    const refKind: GitHubTarget['refKind'] = route === 'commit' ? 'commit' : 'branch'
    return {
      owner,
      repository: repo,
      ref,
      refKind,
      originalUrl: `https://github.com/${owner}/${repo}/${route === 'commit' ? 'commit' : 'tree'}/${ref}`,
    }
  }

  if (route === 'releases') {
    return {
      owner,
      repository: repo,
      refKind: 'default',
      originalUrl: `https://github.com/${owner}/${repo}`,
    }
  }

  return null
}

export interface ExtractRepoReferenceOptions {
  /** Only match explicit GitHub references (github.com/..., github/..., gh:...) and never standalone owner/repo pairs */
  explicitOnly?: boolean
  /** Allow leading-slash /owner/repo paths (ONLY safe when already inside github.com context) */
  allowRelativePath?: boolean
}

/**
 * Heuristic extractor that detects GitHub repositories in text, selections, or explicit references
 * across webpages (GitHub.com, Facebook, Reddit, Instagram, Twitter, blogs, etc.).
 */
export function extractRepoReference(rawText: string, options?: ExtractRepoReferenceOptions): GitHubTarget | null {
  if (!rawText || typeof rawText !== 'string') return null
  let clean = rawText.trim()
  if (clean.length < 3 || clean.length > 2000) return null

  // Unwrap social media tracking redirects (e.g. Facebook l.facebook.com, Reddit out.reddit.com, Google /url)
  clean = unwrapSocialRedirectUrl(clean)
  if (!clean) return null

  // 1. Optional relative GitHub path (ONLY when explicitly enabled for github.com context)
  if (options?.allowRelativePath) {
    const relMatch = clean.match(/^\/([a-zA-Z0-9-]{1,39})\/([a-zA-Z0-9_.-]{1,100})(?:\/(tree)\/([a-zA-Z0-9_.-]+))?(?:\/)?$/)
    if (relMatch) {
      const owner = relMatch[1]
      const repo = relMatch[2].replace(/\.git$/i, '')
      const ref = relMatch[4]
      if (isValidGitHubOwnerAndRepo(owner, repo)) {
        return {
          owner,
          repository: repo,
          ref,
          refKind: ref ? 'branch' : 'default',
          originalUrl: `https://github.com/${owner}/${repo}${ref ? `/tree/${ref}` : ''}`,
        }
      }
    }
  }

  // 2. Explicit github.com URL pattern (strict boundary prevents docs.github.com / gist.github.com matches)
  const urlMatches = clean.matchAll(/(?:^|[\s"'`([<])((?:https?:\/\/)?(?:www\.)?github\.com\/[^\s"'`)\],;<>]+)/gi)
  for (const match of urlMatches) {
    const rawCandidate = match[1].replace(/[.,;:!?]+$/, '')
    const parsedTarget = extractRepoFromUrl(rawCandidate)
    if (parsedTarget) {
      return parsedTarget
    }
  }

  // 3. Explicit social prefix: github/owner/repo, gh/owner/repo, github:owner/repo, gh:owner/repo
  const prefixMatch = clean.match(/(?:^|[\s"'`([<])(?:github|gh)[:/]([a-zA-Z0-9-]{1,39})\/([a-zA-Z0-9_.-]{1,100})(?=$|[\s"'`)\],;:!?])/i)
  if (prefixMatch) {
    const owner = prefixMatch[1]
    const repo = prefixMatch[2].replace(/\.git$/i, '')
    if (isValidGitHubOwnerAndRepo(owner, repo)) {
      return {
        owner,
        repository: repo,
        refKind: 'default',
        originalUrl: `https://github.com/${owner}/${repo}`,
      }
    }
  }

  if (options?.explicitOnly) {
    return null
  }

  // 4. Standalone owner/repo pattern in highlighted user text (e.g. "facebook/react", "vercel/next.js", "@tailwindlabs/tailwindcss")
  const slashMatches = clean.matchAll(/(?:^|[\s"'`([<])@?([a-zA-Z0-9-]{1,39})\/([a-zA-Z0-9_.-]{1,100})(?=$|[\s"'`)\],;:!?])/g)
  for (const match of slashMatches) {
    const owner = match[1]
    const repo = match[2].replace(/\.git$/i, '')

    // Exclude Reddit-style shorthand (r/subreddit, u/username) from standalone selection heuristics
    if (owner.toLowerCase() === 'r' || owner.toLowerCase() === 'u') continue
    if (!isValidGitHubOwnerAndRepo(owner, repo)) continue
    if (/^\d+$/.test(owner) || /^\d+$/.test(repo)) continue
    if (/\.(png|jpe?g|gif|webp|svg|pdf|mp4|webm|zip|tar|gz|exe|dmg|html?|php|css)$/i.test(repo)) continue

    return {
      owner,
      repository: repo,
      refKind: 'default',
      originalUrl: `https://github.com/${owner}/${repo}`,
    }
  }

  return null
}

export interface AnchorDataInput {
  rawHref?: string
  fullHref?: string
  innerText?: string
  title?: string
  pageHostname?: string
}

/**
 * Precision anchor resolver for hover tooltips and direct link right-clicks.
 * Prevents false positives on unrelated relative paths (/r/programming, /groups/123)
 * and non-GitHub link labels (UI/UX, CI/CD, dates).
 */
export function extractRepoFromAnchorData(input: AnchorDataInput): GitHubTarget | null {
  const pageHost = (input.pageHostname || '').toLowerCase()
  const isGitHubSite = pageHost === 'github.com' || pageHost === 'www.github.com'

  const rawHref = (input.rawHref || '').trim()
  const fullHref = (input.fullHref || '').trim()
  const innerText = (input.innerText || '').trim()
  const title = (input.title || '').trim()

  if (/^(?:javascript|mailto|tel|sms|data|blob|about):/i.test(rawHref)) {
    return null
  }

  const isHashAnchor = rawHref.startsWith('#')
  if (isHashAnchor && isGitHubSite) {
    // Ignore same-page README heading / jump anchors on github.com (#installation, #top)
    return null
  }

  // 1. Inspect the destination URL (resolving relative links strictly against the page context)
  if (!isHashAnchor) {
    let urlCandidate = fullHref
    if (!urlCandidate && rawHref) {
      if (rawHref.startsWith('/')) {
        urlCandidate = isGitHubSite ? `https://github.com${rawHref}` : ''
      } else {
        urlCandidate = rawHref
      }
    }

    if (urlCandidate) {
      const unwrapped = unwrapSocialRedirectUrl(urlCandidate)
      const normalizedUnwrapped = /^(?:www\.)?github\.com\//i.test(unwrapped)
        ? `https://${unwrapped}`
        : unwrapped

      if (/^https?:\/\//i.test(normalizedUnwrapped)) {
        try {
          const u = new URL(normalizedUnwrapped)
          const uHost = u.hostname.toLowerCase()
          if (uHost === 'github.com' || uHost === 'www.github.com') {
            // URL explicitly points to github.com: honor strict route acceptance/rejection
            return extractRepoFromUrl(normalizedUnwrapped, { isGitHubSite })
          }
        } catch {
          // Fall through if malformed
        }
      }
    }
  }

  // 2. Fallback to concise visible text / title ONLY for explicit GitHub mentions (e.g. Twitter t.co links showing "github.com/owner/repo")
  if (title && title.length <= 250) {
    const fromTitle = extractRepoReference(title, { explicitOnly: true })
    if (fromTitle) return fromTitle
  }

  if (innerText && innerText.length <= 250) {
    const fromText = extractRepoReference(innerText, { explicitOnly: true })
    if (fromText) return fromText
  }

  return null
}

function safePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

function rateReset(response: Response): string | null {
  const reset = response.headers.get('x-ratelimit-reset')
  return reset ? new Date(Number(reset) * 1000).toISOString() : null
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<ApiResult<T>> {
  const cached = apiCache.get(url)
  const headers = new Headers({ Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' })
  if (configuredGitHubToken) {
    headers.set('Authorization', `Bearer ${configuredGitHubToken}`)
  }
  if (cached?.etag) headers.set('If-None-Match', cached.etag)
  else if (cached?.lastModified) headers.set('If-Modified-Since', cached.lastModified)

  const response = await fetch(url, { headers, signal })
  const remaining = Number(response.headers.get('x-ratelimit-remaining'))
  const remainingValue = Number.isFinite(remaining) ? remaining : null
  const resetAt = rateReset(response)
  latestRateLimit = { remaining: remainingValue, resetAt }

  if (response.status === 304 && cached) {
    return { data: cached.data as T, url, etag: cached.etag }
  }

  if (!response.ok) {
    let message = `GitHub returned HTTP ${response.status}.`
    try {
      const errorBody = (await response.json()) as { message?: string }
      if (errorBody.message) message = errorBody.message
    } catch {
      // Use the status message when GitHub does not return JSON.
    }
    throw new GitHubApiError(message, response.status, remainingValue, resetAt)
  }

  const data = (await response.json()) as T
  apiCache.set(url, {
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
    data,
  })
  return { data, url, etag: response.headers.get('etag') }
}

function endpoint(target: GitHubTarget, path: string): string {
  return `${API_BASE}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repository)}${path}`
}

function decodeBase64(value: string): string {
  const binary = atob(value.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function htmlFileUrl(target: GitHubTarget, ref: string, path: string): string {
  const refPath = ref.split('/').map(encodeURIComponent).join('/')
  return `https://github.com/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repository)}/blob/${refPath}/${safePath(path)}`
}

function htmlTreeUrl(target: GitHubTarget, ref: string, path: string): string {
  const refPath = ref.split('/').map(encodeURIComponent).join('/')
  return `https://github.com/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repository)}/tree/${refPath}/${safePath(path)}`
}

function isManifest(path: string): boolean {
  const base = path.split('/').at(-1)?.toLowerCase()
  return Boolean(base && [
    'package.json', 'cargo.toml', 'pyproject.toml', 'requirements.txt', 'go.mod', 'pom.xml',
    'build.gradle', 'build.gradle.kts', 'composer.json', 'gemfile', 'mix.exs',
  ].includes(base)) || Boolean(base?.endsWith('.csproj'))
}

function manifestEcosystem(path: string): string {
  const file = path.split('/').at(-1)?.toLowerCase() ?? ''
  if (file === 'package.json') return 'Node.js'
  if (file === 'cargo.toml') return 'Rust'
  if (file === 'pyproject.toml' || file === 'requirements.txt') return 'Python'
  if (file === 'go.mod') return 'Go'
  if (file === 'pom.xml') return 'Maven'
  if (file.startsWith('build.gradle')) return 'Gradle'
  if (file === 'composer.json') return 'PHP'
  if (file === 'gemfile') return 'Ruby'
  if (file === 'mix.exs') return 'Elixir'
  if (file.endsWith('.csproj')) return '.NET'
  return 'Unknown'
}

function parseDependencies(path: string, text: string): Dependency[] {
  const file = path.split('/').at(-1)?.toLowerCase() ?? ''
  const dependencies: Dependency[] = []

  if (file === 'package.json' || file === 'composer.json') {
    try {
      const manifest = JSON.parse(text) as Record<string, unknown>
      for (const [section, kind] of [['dependencies', 'runtime'], ['devDependencies', 'development'], ['require', 'runtime'], ['require-dev', 'development']] as const) {
        const entries = manifest[section]
        if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue
        for (const [name, requirement] of Object.entries(entries as Record<string, unknown>)) {
          dependencies.push({ name, requirement: String(requirement), kind, manifest: path })
        }
      }
    } catch {
      return []
    }
    return dependencies
  }

  if (file === 'cargo.toml') {
    let kind: Dependency['kind'] = 'runtime'
    for (const line of text.split(/\r?\n/)) {
      const section = line.match(/^\s*\[([^\]]+)\]\s*$/)?.[1]
      if (section) {
        kind = section.includes('dev-dependencies') ? 'development' : section.includes('dependencies') ? 'runtime' : 'unknown'
        continue
      }
      const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(.+?)\s*(?:#.*)?$/)
      if (match && kind !== 'unknown' && !match[1].startsWith('[')) {
        const version = match[2].match(/(?:version\s*=\s*)?["']([^"']+)["']/)?.[1] ?? 'Declared in manifest'
        dependencies.push({ name: match[1], requirement: version, kind, manifest: path })
      }
    }
    return dependencies
  }

  if (file === 'go.mod') {
    const block = text.match(/require\s*\(([\s\S]*?)\)/)?.[1] ?? text
    for (const line of block.split(/\r?\n/)) {
      const match = line.trim().match(/^([^\s]+)\s+(v[^\s]+)(?:\s+\/\/.*)?$/)
      if (match) dependencies.push({ name: match[1], requirement: match[2], kind: 'runtime', manifest: path })
    }
    return dependencies
  }

  if (file === 'requirements.txt') {
    for (const line of text.split(/\r?\n/)) {
      const match = line.trim().match(/^([A-Za-z0-9_.-]+)\s*(?:[<>=!~].*)?$/)
      if (match && !line.trim().startsWith('#')) {
        dependencies.push({ name: match[1], requirement: line.trim().slice(match[1].length).trim() || 'Unpinned', kind: 'runtime', manifest: path })
      }
    }
    return dependencies
  }

  if (file === 'pom.xml' || file.startsWith('build.gradle') || file.endsWith('.csproj')) {
    const pattern = file === 'pom.xml'
      ? /<dependency>[\s\S]*?<groupId>([^<]+)<\/groupId>[\s\S]*?<artifactId>([^<]+)<\/artifactId>[\s\S]*?<version>([^<]+)<\/version>[\s\S]*?<\/dependency>/g
      : /(?:implementation|api|compileOnly|testImplementation)\s*[({]\s*["']([^"']+)["']/g
    for (const match of text.matchAll(pattern)) {
      dependencies.push({ name: match[2] ? `${match[1]}:${match[2]}` : match[1], requirement: match[3] ?? 'Declared in manifest', kind: /test/i.test(match[0]) ? 'development' : 'runtime', manifest: path })
    }
    return dependencies
  }

  if (file === 'pyproject.toml') {
    const sections = text.split(/^\s*\[([^\]]+)\]\s*$/m)
    for (let index = 1; index < sections.length; index += 2) {
      const section = sections[index]
      if (!section.includes('dependencies')) continue
      const body = sections[index + 1] ?? ''
      for (const match of body.matchAll(/["']([A-Za-z0-9_.-]+)([^"']*)["']/g)) {
        dependencies.push({ name: match[1], requirement: match[2].trim() || 'Unpinned', kind: section.includes('optional') ? 'optional' : 'runtime', manifest: path })
      }
    }
  }

  return dependencies
}

export function extractRuntimeRequirements(path: string, text: string, sourceUrl: string): RuntimeRequirement[] {
  const file = path.split('/').at(-1)?.toLowerCase() ?? ''
  const requirements: RuntimeRequirement[] = []
  const add = (runtime: string, value: string | undefined) => {
    const requirement = value?.trim()
    if (!requirement || requirement.length > 180) return
    requirements.push({ runtime, requirement, manifest: path, sourceUrl })
  }

  if (file === 'package.json') {
    try {
      const data = JSON.parse(text) as { engines?: { node?: unknown } }
      if (typeof data.engines?.node === 'string') add('Node.js', data.engines.node)
    } catch {
      return requirements
    }
  } else if (file === 'cargo.toml') {
    add('Rust', text.match(/^\s*rust-version\s*=\s*["']([^"']+)["']/m)?.[1])
  } else if (file === 'go.mod') {
    add('Go', text.match(/^\s*go\s+([0-9]+(?:\.[0-9]+){1,2})\s*$/m)?.[1])
  } else if (file === 'pyproject.toml') {
    const projectPython = text.match(/^\s*requires-python\s*=\s*["']([^"']+)["']/m)?.[1]
    const poetryPython = text.match(/^\s*python\s*=\s*["']([^"']+)["']/m)?.[1]
    add('Python', projectPython || poetryPython)
  } else if (file.endsWith('.csproj')) {
    const frameworks = text.match(/<TargetFrameworks?>\s*([^<]+)\s*<\/TargetFrameworks?>/i)?.[1]
    const frameworkList = frameworks?.split(';').map((item) => item.trim()).filter(Boolean) ?? []
    for (const framework of frameworkList) add('.NET', framework)
  } else if (file === 'pom.xml') {
    const release = text.match(/<maven\.compiler\.(?:release|source|target)>\s*([^<]+)\s*</i)?.[1]
    add('Java', release)
  } else if (file === 'composer.json') {
    try {
      const data = JSON.parse(text) as { require?: { php?: unknown } }
      if (typeof data.require?.php === 'string') add('PHP', data.require.php)
    } catch {
      return requirements
    }
  } else if (file === 'gemfile') {
    add('Ruby', text.match(/^\s*ruby\s+["']([^"']+)["']/m)?.[1])
  }
  return requirements
}

function summaryFromReadme(text: string): string | null {
  const prose = text
    .replace(/^\s*#.*$/gm, '')
    .replace(/^\s*[-*+>].*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[[^\]]+\]\(([^)]+)\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[`*_~]/g, '')
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .find((paragraph) => paragraph.length >= 24)
  return prose ? prose.slice(0, 520) : null
}

function buildRootDirectories(tree: TreeEntry[]): RepositoryReport['rootDirectories'] {
  const directories = new Map<string, { files: number; directories: number }>()
  for (const entry of tree) {
    const firstSegment = entry.path.split('/')[0]
    if (!firstSegment || !entry.path.includes('/')) continue
    const tally = directories.get(firstSegment) ?? { files: 0, directories: 0 }
    if (entry.type === 'tree' && entry.path.split('/').length === 2) tally.directories += 1
    if (entry.type === 'blob') tally.files += 1
    directories.set(firstSegment, tally)
  }
  return [...directories.entries()]
    .map(([name, counts]) => ({ name, ...counts }))
    .sort((a, b) => (b.files + b.directories) - (a.files + a.directories))
    .slice(0, 40)
}

function selectImportantFiles(tree: TreeEntry[]): TreeEntry[] {
  const priority = (path: string) => {
    const normalized = path.toLowerCase()
    const file = normalized.split('/').at(-1) ?? ''
    if (/^readme(?:\.|$)/.test(file)) return 0
    if (/^(license|licence)(?:\.|$)/.test(file)) return 1
    if (['package.json', 'cargo.toml', 'pyproject.toml', 'requirements.txt', 'go.mod', 'pom.xml'].includes(file) || file.endsWith('.csproj')) return 2
    if (['tauri.conf.json', 'vite.config.ts', 'next.config.js', 'next.config.ts', 'dockerfile', 'makefile'].includes(file)) return 3
    if (/^(main|index|app)\.(rs|ts|tsx|js|jsx|py|go|java|cs)$/.test(file)) return 4
    if (/^\.github\/workflows\//.test(normalized)) return 5
    return 10
  }
  return tree
    .filter((entry) => entry.type === 'blob')
    .map((entry) => ({ entry, rank: priority(entry.path) }))
    .filter((item) => item.rank < 10)
    .sort((a, b) => a.rank - b.rank || a.entry.path.localeCompare(b.entry.path))
    .slice(0, 32)
    .map((item) => item.entry)
}

function manifestRank(path: string): number {
  const file = path.split('/').at(-1)?.toLowerCase() ?? ''
  const rank: Record<string, number> = {
    'package.json': 0,
    'cargo.toml': 1,
    'pyproject.toml': 2,
    'requirements.txt': 3,
    'go.mod': 4,
    'pom.xml': 5,
    'build.gradle': 6,
    'build.gradle.kts': 6,
    'composer.json': 7,
    gemfile: 8,
    'mix.exs': 9,
  }
  return rank[file] ?? (file.endsWith('.csproj') ? 10 : 50)
}

async function readManifest(target: GitHubTarget, ref: string, entry: TreeEntry, signal?: AbortSignal): Promise<ManifestSummary> {
  const sourceUrl = htmlFileUrl(target, ref, entry.path)
  if (entry.size !== null && entry.size > MAX_MANIFEST_BYTES) {
    return { path: entry.path, ecosystem: manifestEcosystem(entry.path), dependencies: [], runtimeRequirements: [], sourceUrl, status: 'too-large' }
  }
  try {
    const result = await fetchJson<ContentApi>(endpoint(target, `/contents/${safePath(entry.path)}?ref=${encodeURIComponent(ref)}`), signal)
    if (result.data.size !== undefined && result.data.size > MAX_MANIFEST_BYTES) {
      return { path: entry.path, ecosystem: manifestEcosystem(entry.path), dependencies: [], runtimeRequirements: [], sourceUrl, status: 'too-large' }
    }
    if (!result.data.content || result.data.encoding !== 'base64') {
      return { path: entry.path, ecosystem: manifestEcosystem(entry.path), dependencies: [], runtimeRequirements: [], sourceUrl, status: 'unavailable' }
    }
    const text = decodeBase64(result.data.content)
    return { path: entry.path, ecosystem: manifestEcosystem(entry.path), dependencies: parseDependencies(entry.path, text).slice(0, 200), runtimeRequirements: extractRuntimeRequirements(entry.path, text, sourceUrl), sourceUrl, status: 'read' }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return { path: entry.path, ecosystem: manifestEcosystem(entry.path), dependencies: [], runtimeRequirements: [], sourceUrl, status: 'unavailable' }
  }
}

function metadataFromApi(owner: string, data: RepositoryApi): RepositoryMetadata {
  return {
    id: data.id,
    fullName: data.full_name,
    owner,
    name: data.name,
    description: data.description,
    htmlUrl: data.html_url,
    homepage: data.homepage || null,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    pushedAt: data.pushed_at,
    defaultBranch: data.default_branch,
    stars: data.stargazers_count,
    forks: data.forks_count,
    watchers: data.watchers_count,
    openIssues: data.open_issues_count,
    sizeKb: data.size,
    archived: data.archived,
    disabled: data.disabled,
    topics: data.topics ?? [],
    license: data.license ? { name: data.license.name, spdxId: data.license.spdx_id, url: data.license.url } : null,
  }
}

export async function analyzeGitHubRepository(
  input: string | GitHubTarget,
  signalOrProgress?: AbortSignal | ((progress: AnalysisProgress) => void),
  progressOrSignal?: ((progress: AnalysisProgress) => void) | AbortSignal,
): Promise<RepositoryReport> {
  let signal: AbortSignal | undefined
  let onProgress: ((progress: AnalysisProgress) => void) | undefined

  if (signalOrProgress instanceof AbortSignal) {
    signal = signalOrProgress
  } else if (typeof signalOrProgress === 'function') {
    onProgress = signalOrProgress
  }

  if (progressOrSignal instanceof AbortSignal) {
    signal = progressOrSignal
  } else if (typeof progressOrSignal === 'function') {
    onProgress = progressOrSignal
  }

  const target = typeof input === 'string' ? parseFlexibleGitHubUrl(input) : input
  latestRateLimit = { remaining: null, resetAt: null }
  const repoEndpoint = endpoint(target, '')
  const repoResponse = await fetchJson<RepositoryApi>(repoEndpoint, signal)
  onProgress?.({ stage: 'metadata', state: 'complete' })
  const repository = metadataFromApi(target.owner, repoResponse.data)
  const resolvedRef = target.ref ?? repository.defaultBranch
  const refSegment = encodeURIComponent(resolvedRef)
  const commitUrl = target.refKind === 'commit'
    ? endpoint(target, `/commits/${refSegment}`)
    : `${endpoint(target, '/commits')}?sha=${encodeURIComponent(resolvedRef)}&per_page=1`

  const treeUrl = endpoint(target, `/git/trees/${refSegment}?recursive=1`)
  const readmeUrl = endpoint(target, `/readme?ref=${encodeURIComponent(resolvedRef)}`)
  const releaseUrl = endpoint(target, '/releases/latest')
  const languagesUrl = endpoint(target, '/languages')

  const track = <T,>(stage: AnalysisStage, operation: Promise<T>) => operation.then(
    (value) => {
      onProgress?.({ stage, state: 'complete' })
      return value
    },
    (error: unknown) => {
      onProgress?.({ stage, state: 'unavailable' })
      throw error
    },
  )
  onProgress?.({ stage: 'tree', state: 'active' })
  onProgress?.({ stage: 'readme', state: 'active' })
  onProgress?.({ stage: 'languages', state: 'active' })
  onProgress?.({ stage: 'commit', state: 'active' })
  onProgress?.({ stage: 'release', state: 'active' })
  const [treeResult, readmeResult, commitResult, releaseResult, languageResult] = await Promise.allSettled([
    track('tree', fetchJson<TreeApi>(treeUrl, signal)),
    track('readme', fetchJson<ReadmeApi>(readmeUrl, signal)),
    track('commit', fetchJson<CommitApi | CommitApi[]>(commitUrl, signal)),
    track('release', fetchJson<ReleaseApi>(releaseUrl, signal)),
    track('languages', fetchJson<Record<string, number>>(languagesUrl, signal)),
  ])

  if (treeResult.status === 'rejected' && treeResult.reason instanceof DOMException && treeResult.reason.name === 'AbortError') throw treeResult.reason
  if (treeResult.status === 'rejected' && treeResult.reason instanceof GitHubApiError && [401, 403, 404].includes(treeResult.reason.status)) {
    throw treeResult.reason
  }

  const sourceStatuses: EvidenceSource[] = [
    { label: 'GitHub repository metadata', url: repoResponse.url, status: 'verified', detail: 'Repository endpoint returned successfully.' },
    { label: 'Repository tree', url: treeUrl, status: treeResult.status === 'fulfilled' ? 'verified' : 'unavailable', detail: treeResult.status === 'fulfilled' ? (treeResult.value.data.truncated ? 'GitHub marked the tree as truncated.' : 'Recursive tree returned successfully.') : 'Tree data could not be read.' },
    { label: 'README', url: readmeUrl, status: readmeResult.status === 'fulfilled' ? 'verified' : readmeResult.reason instanceof GitHubApiError && readmeResult.reason.status === 404 ? 'not-found' : 'unavailable' },
    { label: 'Language statistics', url: languagesUrl, status: languageResult.status === 'fulfilled' ? 'verified' : 'unavailable' },
    { label: 'Latest commit', url: commitUrl, status: commitResult.status === 'fulfilled' ? 'verified' : 'unavailable' },
    { label: 'Latest release', url: releaseUrl, status: releaseResult.status === 'fulfilled' ? 'verified' : releaseResult.reason instanceof GitHubApiError && releaseResult.reason.status === 404 ? 'not-found' : 'unavailable' },
  ]

  const treeApi = treeResult.status === 'fulfilled' ? treeResult.value.data : { tree: [], truncated: false }
  const tree: TreeEntry[] = treeApi.tree
    .slice(0, MAX_TREE_ITEMS)
    .filter((entry) => entry.type === 'blob' || entry.type === 'tree')
    .map((entry) => ({
      path: entry.path,
      type: entry.type as TreeEntry['type'],
      size: typeof entry.size === 'number' ? entry.size : null,
      sha: entry.sha,
      url: entry.type === 'tree' ? htmlTreeUrl(target, resolvedRef, entry.path) : htmlFileUrl(target, resolvedRef, entry.path),
    }))
  const treeTruncated = treeApi.truncated || treeApi.tree.length > MAX_TREE_ITEMS
  const manifestEntries = tree
    .filter((entry) => entry.type === 'blob' && isManifest(entry.path))
    .sort((a, b) => manifestRank(a.path) - manifestRank(b.path) || a.path.split('/').length - b.path.split('/').length)
    .slice(0, MAX_MANIFESTS)

  if (manifestEntries.length) onProgress?.({ stage: 'manifests', state: 'active' })
  const [readmeValue, manifestValues] = await Promise.all([
    readmeResult.status === 'fulfilled' && readmeResult.value.data.content && readmeResult.value.data.encoding === 'base64'
      ? Promise.resolve({ path: readmeResult.value.data.path, url: readmeResult.value.data.html_url, text: decodeBase64(readmeResult.value.data.content).slice(0, MAX_README_CHARACTERS) })
      : Promise.resolve(null),
    Promise.all(manifestEntries.map((entry) => readManifest(target, resolvedRef, entry, signal))),
  ])
  if (manifestEntries.length) onProgress?.({ stage: 'manifests', state: 'complete' })

  const commitData = commitResult.status === 'fulfilled'
    ? Array.isArray(commitResult.value.data) ? commitResult.value.data[0] : commitResult.value.data
    : null
  const latestCommit: LatestCommit | null = commitData ? {
    sha: commitData.sha,
    message: commitData.commit.message.split(/\r?\n/, 1)[0],
    date: commitData.commit.committer?.date ?? null,
    url: commitData.html_url,
  } : null

  const releaseData = releaseResult.status === 'fulfilled' ? releaseResult.value.data : null
  const latestRelease: LatestRelease = releaseData ? {
    name: releaseData.name,
    tagName: releaseData.tag_name,
    publishedAt: releaseData.published_at,
    url: releaseData.html_url,
    assets: releaseData.assets.map((asset) => ({ name: asset.name, size: asset.size, downloadUrl: asset.browser_download_url, contentType: asset.content_type })),
  } : null

  const languages = languageResult.status === 'fulfilled'
    ? Object.entries(languageResult.value.data).map(([name, bytes]) => ({ name, bytes })).sort((a, b) => b.bytes - a.bytes)
    : []
  const manifests: ManifestSummary[] = manifestValues
  const dependencies: Dependency[] = manifests.flatMap((manifest) => manifest.dependencies)
  const runtimeRequirements: RuntimeRequirement[] = manifests.flatMap((manifest) => manifest.runtimeRequirements)
  const rootDirectories = buildRootDirectories(tree)
  const importantFiles = selectImportantFiles(tree)
  const languageNames = languages.map((language) => language.name)
  const ecosystems = [...new Set(manifests.map((manifest) => manifest.ecosystem))]
  const technicalSummary = [
    languageNames.length ? `Lenguajes principales detectados: ${languageNames.join(', ')}.` : 'Estadísticas de lenguaje no disponibles.',
    ecosystems.length ? `Ecosistemas y gestores detectados: ${ecosystems.join(', ')}.` : 'No se detectaron manifiestos de dependencias estándar en la raíz.',
    `Estructura con ${tree.length.toLocaleString()} archivos y carpetas indexados${treeTruncated ? ' (árbol parcial o truncado por tamaño)' : ''}.`,
  ].join(' ')

  return {
    target,
    repository,
    resolvedRef,
    analyzedAt: new Date().toISOString(),
    languages,
    tree,
    treeTruncated,
    treeCountReported: treeApi.tree.length,
    rootDirectories,
    importantFiles,
    readme: readmeValue,
    manifests,
    dependencies,
    runtimeRequirements,
    latestCommit,
    latestRelease,
    simpleSummary: readmeValue ? summaryFromReadme(readmeValue.text) : repository.description,
    technicalSummary,
    sources: sourceStatuses,
    apiRateLimit: latestRateLimit,
  }
}

export function clearGitHubMemoryCache(): void {
  apiCache.clear()
}

const LANGUAGE_COLORS: Record<string, string> = {
  typescript: '#3178c6',
  javascript: '#e6b800',
  rust: '#d96b38',
  python: '#3572a5',
  go: '#00add8',
  java: '#b07219',
  'c#': '#178600',
  'c++': '#f34b7d',
  c: '#555555',
  html: '#e34c26',
  css: '#663399',
  scss: '#c6538c',
  shell: '#89e051',
  powershell: '#012456',
  php: '#4f5d95',
  ruby: '#701516',
  elixir: '#6e4a7e',
  kotlin: '#a97bff',
  swift: '#f05138',
  dart: '#00b4ab',
  vue: '#41b883',
  svelte: '#ff3e00',
}

export function getLanguageColor(name: string): string {
  return LANGUAGE_COLORS[name.trim().toLowerCase()] ?? '#cf5b0b'
}

function parseSemverTuple(raw: string): [number, number, number] | null {
  const match = raw.trim().replace(/^[v=]+/i, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
  if (!match) return null
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]
}

function compareSemver(a: [number, number, number], b: [number, number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0]
  if (a[1] !== b[1]) return a[1] - b[1]
  return a[2] - b[2]
}

export type RuntimeCompatibilityVerdict = 'compatible' | 'incompatible' | 'unverified'

export function evaluateRuntimeCompatibility(
  installedVersion: string | null | undefined,
  requirement: string,
): RuntimeCompatibilityVerdict {
  if (!installedVersion) return 'unverified'
  const installed = parseSemverTuple(installedVersion)
  if (!installed) return 'unverified'

  const trimmed = requirement.trim()
  // Handle simple OR ranges like ">=18 || >=20" by checking if any branch matches
  if (trimmed.includes('||')) {
    const branches = trimmed.split('||').map((part) => evaluateRuntimeCompatibility(installedVersion, part))
    if (branches.includes('compatible')) return 'compatible'
    if (branches.every((verdict) => verdict === 'incompatible')) return 'incompatible'
    return 'unverified'
  }

  // Handle .NET target frameworks such as "net8.0"
  const netMatch = trimmed.match(/^net(\d+)\.(\d+)/i)
  if (netMatch) {
    const required: [number, number, number] = [Number(netMatch[1]), Number(netMatch[2]), 0]
    return compareSemver(installed, required) >= 0 ? 'compatible' : 'incompatible'
  }

  const clauseMatch = trimmed.match(/^(>=|<=|>|<|\^|~|=)?\s*v?(\d+(?:\.\d+){0,2})(?:\.x|\.\*)?$/i)
  if (!clauseMatch) return 'unverified'

  const operator = clauseMatch[1] ?? '>='
  const target = parseSemverTuple(clauseMatch[2])
  if (!target) return 'unverified'

  const cmp = compareSemver(installed, target)
  switch (operator) {
    case '>=':
      return cmp >= 0 ? 'compatible' : 'incompatible'
    case '>':
      return cmp > 0 ? 'compatible' : 'incompatible'
    case '<=':
      return cmp <= 0 ? 'compatible' : 'incompatible'
    case '<':
      return cmp < 0 ? 'compatible' : 'incompatible'
    case '=':
      return cmp === 0 ? 'compatible' : 'incompatible'
    case '^':
      return cmp >= 0 && installed[0] === target[0] ? 'compatible' : 'incompatible'
    case '~':
      return cmp >= 0 && installed[0] === target[0] && installed[1] === target[1] ? 'compatible' : 'incompatible'
    default:
      return 'unverified'
  }
}
