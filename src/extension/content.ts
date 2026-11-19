// Content script running on github.com pages
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { injectCodeTreeHost } from './content/dockHost'
import { InPageCodeTreeDock } from './components/InPageCodeTreeDock'
import type { TreeEntry, RepositoryReport } from '../features/repository/types'

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

export function parseGitHubRepo(urlStr: string): ParsedRepoInfo | null {
  try {
    const url = new URL(urlStr)
    if (url.hostname.toLowerCase() !== 'github.com') return null
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
      url: `https://github.com/${owner}/${repo}${ref ? `/tree/${ref}` : ''}`,
    }
  } catch {
    return null
  }
}

export function shouldMountDock(urlStr: string): boolean {
  return parseGitHubRepo(urlStr) !== null
}

// In-page dock lifecycle manager
let dockRoot: Root | null = null
let currentRepoFullName: string | null = null

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

  const renderDock = (report?: RepositoryReport, isPro = false) => {
    const treeEntries: TreeEntry[] = report?.tree && report.tree.length > 0 ? report.tree : report?.importantFiles || []
    const isAnalyzed = Boolean(report && treeEntries.length > 0)

    dockRoot?.render(
      React.createElement(InPageCodeTreeDock, {
        owner: repo.owner,
        repo: repo.repo,
        ref: repo.ref || report?.defaultBranch || 'main',
        initialEntries: treeEntries,
        isAnalyzed: isAnalyzed,
        isPro: isPro,
        onOpenSidepanel: () => {
          chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' }).catch(() => {})
        },
        onTriggerAnalysis: () => {
          chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' }).catch(() => {})
        },
      })
    )
  }

  // Load from chrome.storage.local
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get(['gpi_reports', 'gpi_auth_user'], (res) => {
      const reports = res?.gpi_reports || {}
      const report = reports[repo.fullName] as RepositoryReport | undefined
      const authUser = res?.gpi_auth_user
      const isPro = Boolean(authUser?.isPro)
      renderDock(report, isPro)
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
  currentRepoFullName = null
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
    if (currentRepoFullName !== repo.fullName) {
      currentRepoFullName = repo.fullName
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

  // Listen to chrome.storage.local changes (e.g. analysis finishes in Sidepanel/Popup)
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && (changes.gpi_reports || changes.gpi_auth_user)) {
        const repo = parseGitHubRepo(window.location.href)
        if (repo) {
          updateDock(repo)
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
