import { handleAuthRuntimeMessage } from '../src/extension/auth/supabaseAuth'
import { extractRepoReference, parseFlexibleGitHubUrl } from '../src/features/repository/github'
import type { GitHubTarget } from '../src/features/repository/types'

export default defineBackground(() => {
  let lastContentScriptTarget: { target: GitHubTarget; timestamp: number } | null = null

  function setupContextMenus() {
    if (!chrome.contextMenus) return
    chrome.contextMenus.removeAll(() => {
      // 1. Context menu available on links, selections, and general page/media
      chrome.contextMenus.create({
        id: 'analyze-selection-repo',
        title: '🐙 Analizar repositorio con GitHub Intelligence',
        contexts: ['link', 'selection', 'page', 'image', 'video'],
      })

      // 2. Open side panel standalone option
      chrome.contextMenus.create({
        id: 'open-side-panel',
        title: 'Abrir GitHub Intelligence en Panel Lateral',
        contexts: ['action'],
      })
    })
  }

  async function setupSidePanel() {
    if (chrome.sidePanel?.setPanelBehavior) {
      try {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
      } catch {
        // Ignore if unsupported
      }
    }

    if (chrome.sidePanel?.setOptions) {
      try {
        await chrome.sidePanel.setOptions({
          path: 'sidepanel.html',
          enabled: true,
        })
      } catch {
        // Ignore if unsupported
      }
    }
  }

  // Configure context menus and side panel behavior on installation / startup
  chrome.runtime.onInstalled.addListener(async () => {
    setupContextMenus()
    await setupSidePanel()
  })

  chrome.runtime.onStartup?.addListener(() => {
    setupContextMenus()
    void setupSidePanel()
  })

  // Ensure side panel is configured on service worker start
  void setupSidePanel()

  // Handle context menu clicks
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    const windowId = tab?.windowId
    const tabId = tab?.id

    // CRITICAL: Call sidePanel.open SYNCHRONOUSLY at the top of the user click callback
    // Prioritize windowId for global manifest sidepanel, fallback to tabId
    if (chrome.sidePanel?.open) {
      if (windowId) {
        chrome.sidePanel.open({ windowId }).catch((err) => {
          console.warn('Could not open sidePanel with windowId:', err)
          if (tabId) chrome.sidePanel.open({ tabId }).catch(() => {})
        })
      } else if (tabId) {
        chrome.sidePanel.open({ tabId }).catch(() => {})
      }
    }

    if (info.menuItemId === 'open-side-panel') {
      return
    }

    if (info.menuItemId === 'analyze-selection-repo') {
      void (async () => {
        let target: GitHubTarget | null = null

        // 1. Prioritize direct link URL (unwraps Facebook l.facebook.com, Reddit out.reddit.com, Google, etc.)
        if (info.linkUrl) {
          target = extractRepoReference(info.linkUrl, { explicitOnly: true }) || (() => {
            try {
              return parseFlexibleGitHubUrl(info.linkUrl)
            } catch {
              return null
            }
          })()
        }

        // 2. Check if content script captured the right-clicked element/anchor on the page (within 8 seconds)
        if (!target && lastContentScriptTarget && (Date.now() - lastContentScriptTarget.timestamp < 8000)) {
          target = lastContentScriptTarget.target
        }

        // 3. Inspect selected text if any (supports standalone owner/repo from manual selection)
        if (!target && info.selectionText) {
          target = extractRepoReference(info.selectionText) || (() => {
            try {
              return parseFlexibleGitHubUrl(info.selectionText)
            } catch {
              return null
            }
          })()
        }

        // 4. Inspect current page URL
        if (!target && info.pageUrl) {
          target = extractRepoReference(info.pageUrl, { explicitOnly: true }) || (() => {
            try {
              return parseFlexibleGitHubUrl(info.pageUrl)
            } catch {
              return null
            }
          })()
        }

        if (target) {
          // Persist target in local storage so side panel / popup reads it immediately on mount
          await chrome.storage.local.set({ gpi_pending_analysis: target })

          // Broadcast to ensure side panel catches the message if already open
          chrome.runtime.sendMessage({ type: 'TRIGGER_ANALYSIS', target }).catch(() => {})
        }
      })()
    }
  })

  // Session-persisted repository info helpers (survives service worker termination)
  const SESSION_KEY = 'gpi_active_repo_info'

  async function setActiveRepoSession(repo: unknown): Promise<void> {
    if (chrome.storage?.session) {
      try {
        await chrome.storage.session.set({ [SESSION_KEY]: repo || null })
      } catch {
        // Ignore if session storage fails
      }
    }
  }

  async function getActiveRepoSession(): Promise<unknown> {
    if (chrome.storage?.session) {
      try {
        const data = await chrome.storage.session.get(SESSION_KEY)
        return data?.[SESSION_KEY] ?? null
      } catch {
        return null
      }
    }
    return null
  }

  function updateBadge(hasRepo: boolean, tabId?: number) {
    if (!tabId) return
    if (hasRepo) {
      chrome.action.setBadgeText({ text: 'AI', tabId })
      chrome.action.setBadgeBackgroundColor({ color: '#2ea043', tabId })
      chrome.action.setTitle({
        title: 'GitHub Intelligence: Repositorio detectado. Haz clic para ver el resumen.',
        tabId,
      })
    } else {
      chrome.action.setBadgeText({ text: '', tabId })
      chrome.action.setTitle({
        title: 'GitHub Intelligence Assistant',
        tabId,
      })
    }
  }

  // Listen to messages from content script, popup, or side panel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Content script reporting what element was right-clicked before context menu opened
    if (message?.type === 'LAST_RIGHT_CLICK_REPO') {
      lastContentScriptTarget = message.target
        ? {
            target: message.target as GitHubTarget,
            timestamp: Date.now(),
          }
        : null
      sendResponse?.({ ok: true })
      return true
    }

    if (message?.type === 'OPEN_SIDEPANEL_FOR_REPO') {
      const target = message.target as GitHubTarget | undefined
      const windowId = sender.tab?.windowId || message.windowId
      const tabId = sender.tab?.id

      // Synchronously trigger open immediately using windowId in response to content script user gesture
      if (chrome.sidePanel?.open) {
        if (windowId) {
          chrome.sidePanel.open({ windowId }).catch((err) => {
            console.warn('Could not open sidePanel with windowId:', err)
            if (tabId) {
              chrome.sidePanel.open({ tabId }).catch(() => {})
            }
          })
        } else if (tabId) {
          chrome.sidePanel.open({ tabId }).catch(() => {})
        }
      }

      if (target) {
        void chrome.storage.local.set({ gpi_pending_analysis: target }).then(() => {
          chrome.runtime.sendMessage({ type: 'TRIGGER_ANALYSIS', target }).catch(() => {})
        })
      }
      sendResponse?.({ ok: true })
      return true
    }

    if (message?.type === 'OPEN_SIDEPANEL') {
      const windowId = sender.tab?.windowId || message.windowId
      const tabId = sender.tab?.id
      if (chrome.sidePanel?.open) {
        if (windowId) {
          chrome.sidePanel.open({ windowId }).catch(() => {
            if (tabId) chrome.sidePanel.open({ tabId }).catch(() => {})
          })
        } else if (tabId) {
          chrome.sidePanel.open({ tabId }).catch(() => {})
        }
        sendResponse?.({ ok: true })
        return true
      }
      sendResponse?.({ ok: false, error: 'Side panel API not supported' })
      return true
    }

    if (message?.type === 'GITHUB_PAGE_CHANGED') {
      const repo = message.repo || null
      void (async () => {
        await setActiveRepoSession(repo)
        if (sender.tab?.id) {
          updateBadge(Boolean(repo), sender.tab.id)
        }
        chrome.runtime.sendMessage({
          type: 'BROADCAST_ACTIVE_REPO',
          repo,
          tabId: sender.tab?.id,
          url: message.url,
        }).catch(() => {})
        sendResponse({ ok: true })
      })()
      return true
    }

    if (message?.type === 'GET_ACTIVE_REPO_STATE') {
      void (async () => {
        const repo = await getActiveRepoSession()
        sendResponse({ repo })
      })()
      return true
    }

    if (message?.type === 'SIGN_IN_WITH_GITHUB' || message?.type === 'INITIATE_PRO_UPGRADE') {
      void handleAuthRuntimeMessage(message).then((result) => {
        sendResponse(result ?? { ok: false, error: 'Unsupported auth message' })
      })
      return true
    }
  })

  // Track active tab changes
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId)
      if (tab.url && tab.url.includes('github.com/')) {
        const parts = new URL(tab.url).pathname.split('/').filter(Boolean)
        if (parts.length >= 2) {
          updateBadge(true, activeInfo.tabId)
          return
        }
      }
      updateBadge(false, activeInfo.tabId)
    } catch {
      // Tab might be closing
    }
  })
})
