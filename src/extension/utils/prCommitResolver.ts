export type PrFileStatus = 'added' | 'modified' | 'deleted' | 'renamed'

export interface PrFileEntry {
  filename: string
  status: PrFileStatus
  additions: number
  deletions: number
  changes: number
  diffAnchor: string
  rawUrl?: string
}

export interface PrOrCommitTarget {
  isPrOrCommit: boolean
  type: 'pr' | 'commit' | null
  owner?: string
  repo?: string
  id?: string
  pullNumber?: number
  commitSha?: string
}

export interface PrOrCommitResolution {
  isPrOrCommit: boolean
  type?: 'pr' | 'commit'
  title?: string
  files: PrFileEntry[]
}

export function parsePrOrCommitUrl(urlStr: string): PrOrCommitTarget {
  try {
    const url = new URL(urlStr)
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 4) {
      return { isPrOrCommit: false, type: null }
    }

    const owner = parts[0]
    const repo = parts[1].replace(/\.git$/i, '')
    const action = parts[2].toLowerCase()
    const id = parts[3]

    if (action === 'pull' && id) {
      const pullNumber = parseInt(id, 10)
      if (!isNaN(pullNumber)) {
        return {
          isPrOrCommit: true,
          type: 'pr',
          owner,
          repo,
          id,
          pullNumber,
        }
      }
    }

    if (action === 'commit' && id && /^[0-9a-f]{7,40}$/i.test(id)) {
      return {
        isPrOrCommit: true,
        type: 'commit',
        owner,
        repo,
        id,
        commitSha: id,
      }
    }
  } catch {
    // Ignore invalid URLs
  }

  return { isPrOrCommit: false, type: null }
}

async function computeDiffAnchor(path: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const data = new TextEncoder().encode(path)
      const hashBuf = await crypto.subtle.digest('SHA-256', data)
      const hashArr = Array.from(new Uint8Array(hashBuf))
      const hashHex = hashArr.map((b) => b.toString(16).padStart(2, '0')).join('')
      return `diff-${hashHex}`
    }
  } catch {
    // Fall back to simple hash
  }

  let h = 0
  for (let i = 0; i < path.length; i++) {
    h = (Math.imul(31, h) + path.charCodeAt(i)) | 0
  }
  return `diff-${Math.abs(h).toString(16)}`
}

function scrapeDomForChangedFiles(): PrFileEntry[] {
  if (typeof document === 'undefined') return []
  const files: PrFileEntry[] = []
  const fileEls = document.querySelectorAll('[data-tagsearch-path], .file[data-path], [id^="diff-"]')
  const seen = new Set<string>()

  fileEls.forEach((el, index) => {
    const filename =
      el.getAttribute('data-tagsearch-path') ||
      el.getAttribute('data-path') ||
      el.querySelector('.file-header [data-path]')?.getAttribute('data-path') ||
      el.querySelector('.file-header')?.getAttribute('data-file-path') ||
      ''

    if (!filename || seen.has(filename)) return
    seen.add(filename)

    const anchor = el.id && el.id.startsWith('diff-') ? el.id : `diff-${index}`

    const statText = el.querySelector('.diffstat, [aria-label*="lines changed"]')?.textContent || ''
    const addMatch = /\+(\d+)/.exec(statText)
    const delMatch = /-(\d+)/.exec(statText)
    const additions = addMatch ? parseInt(addMatch[1], 10) : 0
    const deletions = delMatch ? parseInt(delMatch[1], 10) : 0

    files.push({
      filename,
      status: 'modified',
      additions,
      deletions,
      changes: additions + deletions,
      diffAnchor: anchor,
    })
  })

  return files
}

export async function resolvePrOrCommitFiles(
  target: PrOrCommitTarget,
  token?: string
): Promise<PrOrCommitResolution> {
  if (!target.isPrOrCommit || !target.owner || !target.repo) {
    return { isPrOrCommit: false, files: [] }
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  try {
    if (target.type === 'pr' && target.pullNumber) {
      const apiUrl = `https://api.github.com/repos/${target.owner}/${target.repo}/pulls/${target.pullNumber}/files?per_page=100`
      const res = await fetch(apiUrl, { headers })
      if (!res.ok) {
        throw new Error(`GitHub API error: ${res.status}`)
      }
      const rawFiles = (await res.json()) as Array<{
        filename: string
        status?: string
        additions?: number
        deletions?: number
        changes?: number
        raw_url?: string
      }>

      const files: PrFileEntry[] = await Promise.all(
        rawFiles.map(async (f) => ({
          filename: f.filename,
          status: (f.status as PrFileStatus) || 'modified',
          additions: f.additions || 0,
          deletions: f.deletions || 0,
          changes: f.changes || (f.additions || 0) + (f.deletions || 0),
          diffAnchor: await computeDiffAnchor(f.filename),
          rawUrl: f.raw_url,
        }))
      )

      return {
        isPrOrCommit: true,
        type: 'pr',
        title: `PR #${target.pullNumber}`,
        files,
      }
    }

    if (target.type === 'commit' && target.commitSha) {
      const apiUrl = `https://api.github.com/repos/${target.owner}/${target.repo}/commits/${target.commitSha}`
      const res = await fetch(apiUrl, { headers })
      if (!res.ok) {
        throw new Error(`GitHub API error: ${res.status}`)
      }
      const rawCommit = (await res.json()) as {
        commit?: { message?: string }
        files?: Array<{
          filename: string
          status?: string
          additions?: number
          deletions?: number
          changes?: number
          raw_url?: string
        }>
      }

      const commitMessage = rawCommit.commit?.message || ''
      const firstLineTitle = commitMessage.split('\n')[0] || `Commit ${target.commitSha.slice(0, 7)}`

      const files: PrFileEntry[] = await Promise.all(
        (rawCommit.files || []).map(async (f) => ({
          filename: f.filename,
          status: (f.status as PrFileStatus) || 'modified',
          additions: f.additions || 0,
          deletions: f.deletions || 0,
          changes: f.changes || (f.additions || 0) + (f.deletions || 0),
          diffAnchor: await computeDiffAnchor(f.filename),
          rawUrl: f.raw_url,
        }))
      )

      return {
        isPrOrCommit: true,
        type: 'commit',
        title: firstLineTitle,
        files,
      }
    }
  } catch {
    // If API call fails (rate limit or network), try scraping from DOM
    const scraped = scrapeDomForChangedFiles()
    if (scraped.length > 0) {
      return {
        isPrOrCommit: true,
        type: target.type || 'pr',
        title: target.type === 'pr' ? `PR #${target.pullNumber}` : `Commit ${target.commitSha?.slice(0, 7)}`,
        files: scraped,
      }
    }
  }

  return {
    isPrOrCommit: true,
    type: target.type || 'pr',
    files: [],
  }
}
