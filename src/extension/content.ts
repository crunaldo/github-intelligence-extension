// Content script running on github.com pages
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { injectCodeTreeHost } from './content/dockHost'
import { InPageCodeTreeDock } from './components/InPageCodeTreeDock'
import type { TreeEntry, RepositoryReport } from '../features/repository/types'
import type { CodeTreePreferences } from './storage'
import { DEFAULT_CODE_TREE_PREFERENCES } from './storage'
import { applyCodeFontSettings } from './content/codeFontInjector'
import { parsePrOrCommitUrl } from './utils/prCommitResolver'

const RESERVED_NAMES = new Set([
  'about',
  'pricing',
  'security',
  'login',
  'join',
  'explore',
  'trending',
  'collections',
  'events',
  'sponsors',
  'features',
  'enterprise',
  'team',
  'search',
  'settings',
  'notifications',
  'marketplace',
  'pulls',
  'issues',
  'dashboard',
  'orgs',
  'users',
  'site',
  'contact',
  'status',
])

export interface ParsedRepoInfo {
  owner: string
  repo: string
  ref?: string
  fullName: string
  url: string
}

export function isSupportedGitHubHost(hostname: string, customDomains?: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'github.com' || host === 'www.github.com') return true
  if (!customDomains) return false
  const allowed = customDomains
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
  return allowed.includes(host)
}

export function parseGitHubRepo(urlStr: string, customDomains?: string): ParsedRepoInfo | null {
  try {
    const url = new URL(urlStr)
    if (!isSupportedGitHubHost(url.hostname, customDomains)) return null
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null

    const owner = parts[0]
    const repo = parts[1].replace(/\.git$/i, '')

    if (RESERVED_NAMES.has(owner.toLowerCase())) return null

    let ref: string | undefined
    if (parts.length >= 4 && (parts[2] === 'tree' || parts[2] === 'blob' || parts[2] === 'commit')) {
      ref = parts[3]
    }

    return {
      owner,
      repo,
      ref,
      fullName: `${owner}/${repo}`,
      url: `https://${url.hostname}/${owner}/${repo}${ref ? `/tree/${ref}` : ''}`,
    }
  } catch {
    return null
  }
}

export function shouldMountDock(urlStr: string, customDomains?: string): boolean {
  return parseGitHubRepo(urlStr, customDomains) !== null
}

// In-page dock lifecycle manager
let dockRoot: Root | null = null
let currentRepoKey: string | null = null

function updateDock(repo: ParsedRepoInfo) {
  if (typeof document === 'undefined') return

  const { shadowRoot } = injectCodeTreeHost()

  let mountPoint = shadowRoot.getElementById('gpi-dock-root')
  if (!mountPoint) {
    mountPoint = document.createElement('div')
    mountPoint.id = 'gpi-dock-root'
    shadowRoot.appendChild(mountPoint)
  }

  if (!dockRoot) {
    dockRoot = createRoot(mountPoint)
  }

  const renderDock = (
    report?: RepositoryReport,
    isPro = false,
    codeTreePrefs: CodeTreePreferences = DEFAULT_CODE_TREE_PREFERENCES
  ) => {
    const treeEntries: TreeEntry[] = report?.tree && report.tree.length > 0 ? report.tree : report?.importantFiles || []
    const isAnalyzed = Boolean(report && treeEntries.length > 0)

    // Extract vulnerable manifests if security findings exist
    const vulnerableManifests: string[] = []
    const auditConcerns = report?.aiAnalysis?.deepAudit?.concerns || []
    if (auditConcerns.length > 0 && report?.dependencies) {
      report.dependencies.forEach((dep) => {
        const isMentioned = auditConcerns.some((c) => c.toLowerCase().includes(dep.name.toLowerCase()))
        if (isMentioned && dep.manifest) {
          vulnerableManifests.push(dep.manifest)
        }
      })
    }

    const isPinnedOrOpen = (() => {
      try {
        return (
          sessionStorage.getItem('gpi_code_tree_pinned') === 'true' ||
          sessionStorage.getItem('gpi_dock_is_open') === 'true' ||
          localStorage.getItem('gpi_code_tree_pinned') === 'true'
        )
      } catch {
        return false
      }
    })()

    dockRoot?.render(
      React.createElement(InPageCodeTreeDock, {
        owner: repo.owner,
        repo: repo.repo,
        ref: repo.ref || report?.resolvedRef || report?.repository?.defaultBranch || 'main',
        initialEntries: treeEntries,
        isAnalyzed: isAnalyzed,
        isPro: isPro,
        defaultOpen: isPinnedOrOpen,
        vulnerableManifests,
        codeTreePreferences: codeTreePrefs,
        targetUrl: window.location.href,
        onOpenSidepanel: () => {
          chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' }).catch(() => {})
        },
        onOpenSettings: () => {
          chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL_SETTINGS', target: 'codeTree' }).catch(() => {})
        },
        onTriggerAnalysis: () => {
          chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' }).catch(() => {})
        },
      })
    )
  }

  // Load from chrome.storage.local
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get(['gpi_reports', 'gpi_auth_session', 'gpi_preferences'], (res) => {
      const reports = (res?.gpi_reports as Record<string, RepositoryReport>) || {}
      const report = (reports[repo.fullName.toLowerCase()] || reports[repo.fullName]) as RepositoryReport | undefined
      const authSession = res?.gpi_auth_session as { isPro?: boolean } | undefined
      const isPro = Boolean(authSession?.isPro)
      const prefs = res?.gpi_preferences as { codeTree?: CodeTreePreferences } | undefined
      const codeTreePrefs: CodeTreePreferences = {
        ...DEFAULT_CODE_TREE_PREFERENCES,
        ...(prefs?.codeTree || {}),
      }
      applyCodeFontSettings(codeTreePrefs)
      renderDock(report, isPro, codeTreePrefs)
    })
  } else {
    renderDock()
  }
}

function unmountDock() {
  if (dockRoot) {
    dockRoot.unmount()
    dockRoot = null
  }
  const host = typeof document !== 'undefined' ? document.getElementById('gpi-code-tree-host') : null
  if (host && host.parentNode) {
    host.parentNode.removeChild(host)
  }
  currentRepoKey = null
}

function handleNavigation() {
  if (typeof window === 'undefined') return
  const currentUrl = window.location.href
  const repo = parseGitHubRepo(currentUrl)

  try {
    chrome.runtime.sendMessage({
      type: 'GITHUB_PAGE_CHANGED',
      url: currentUrl,
      repo,
    }).catch(() => {})
  } catch {
    // Ignore context invalidated
  }

  if (repo) {
    const prTarget = parsePrOrCommitUrl(window.location.href)
    const isFilesTab = window.location.href.includes('/files')
    const targetSuffix = prTarget.isPrOrCommit
      ? `${prTarget.type}:${prTarget.id}${isFilesTab ? ':files' : ''}`
      : (repo.ref || '')
    const nextKey = `${repo.fullName.toLowerCase()}@${targetSuffix}`
    if (currentRepoKey !== nextKey) {
      currentRepoKey = nextKey
      updateDock(repo)
    }
  } else {
    unmountDock()
  }
}

// Initialize on GitHub window
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  let lastUrl = window.location.href

  const onNav = () => {
    const currentUrl = window.location.href
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl
      handleNavigation()
    }
  }

  document.addEventListener('turbo:load', onNav)
  document.addEventListener('turbo:render', onNav)
  document.addEventListener('pjax:end', onNav)
  window.addEventListener('popstate', onNav)

  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href
      handleNavigation()
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })

  // Listen to chrome.storage.local changes (e.g. analysis finishes in Sidepanel/Popup or login/pro change)
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local') {
        const newPrefs = changes.gpi_preferences?.newValue as { codeTree?: CodeTreePreferences } | undefined
        if (newPrefs?.codeTree) {
          applyCodeFontSettings({
            ...DEFAULT_CODE_TREE_PREFERENCES,
            ...newPrefs.codeTree,
          })
        }
        if (changes.gpi_reports || changes.gpi_auth_session || changes.gpi_preferences) {
          const repo = parseGitHubRepo(window.location.href)
          if (repo) {
            updateDock(repo)
          }
        }
      }
    })
  }

  // Listen for direct queries from popup or sidepanel
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      if (request?.type === 'GET_CURRENT_PAGE_REPO') {
        const repo = parseGitHubRepo(window.location.href)
        sendResponse({ repo, url: window.location.href })
        return true
      }
    })
  }

  // Initial mount
  handleNavigation()
}
