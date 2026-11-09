import { extractRepoReference, parseFlexibleGitHubUrl } from '../src/features/repository/github'

export default defineBackground(() => {
  // Setup context menus
  chrome.runtime.onInstalled.addListener(async () => {
    // 1. Context menu for selected text or right-clicked links
    chrome.contextMenus.create({
      id: 'analyze-selection-repo',
      title: '🐙 Analizar repositorio con GitHub Intelligence',
      contexts: ['selection', 'link'],
    })

    // 2. Context menu for opening the side panel on any page
    chrome.contextMenus.create({
      id: 'open-side-panel',
      title: 'Abrir GitHub Intelligence en Panel Lateral',
      contexts: ['page', 'action'],
    })

    // Keep popup as default action, side panel can be opened from popup or context menu
    if (chrome.sidePanel?.setPanelBehavior) {
      try {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
      } catch {
        // Ignore if unsupported
      }
    }

    // Ensure default path is configured and enabled
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
  })

  // Handle context menu clicks
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'open-side-panel' && tab?.windowId) {
      try {
        await chrome.sidePanel.open({ windowId: tab.windowId })
      } catch (err) {
        console.warn('Failed to open side panel:', err)
      }
      return
    }

    if (info.menuItemId === 'analyze-selection-repo') {
      const rawCandidate = (info.selectionText || info.linkUrl || '').trim()
      let target = extractRepoReference(rawCandidate)
      if (!target && rawCandidate) {
        try {
          target = parseFlexibleGitHubUrl(rawCandidate)
        } catch {
          target = null
        }
      }

      if (target) {
        await chrome.storage.local.set({ gpi_pending_analysis: target })
      }

      if (tab?.windowId && chrome.sidePanel?.open) {
        try {
          await chrome.sidePanel.open({ windowId: tab.windowId })
          if (target) {
            chrome.runtime.sendMessage({ type: 'TRIGGER_ANALYSIS', target }).catch(() => {})
          }
        } catch (err) {
          console.warn('Failed to open side panel for repo:', err)
        }
      }
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
    if (message?.type === 'OPEN_SIDEPANEL_FOR_REPO') {
      const target = message.target
      const windowId = sender.tab?.windowId || message.windowId
      ;(async () => {
        if (target) {
          await chrome.storage.local.set({ gpi_pending_analysis: target })
        }
        if (windowId && chrome.sidePanel?.open) {
          try {
            await chrome.sidePanel.open({ windowId })
            if (target) {
              chrome.runtime.sendMessage({ type: 'TRIGGER_ANALYSIS', target }).catch(() => {})
            }
            sendResponse({ ok: true })
          } catch (err) {
            sendResponse({ ok: false, error: String(err) })
          }
        } else {
          sendResponse({ ok: false, error: 'Side panel unsupported or no windowId' })
        }
      })()
      return true
    }

    if (message?.type === 'OPEN_SIDEPANEL') {
      const windowId = sender.tab?.windowId || message.windowId
      if (windowId && chrome.sidePanel?.open) {
        ;(async () => {
          try {
            await chrome.sidePanel.open({ windowId })
            sendResponse({ ok: true })
          } catch (err) {
            sendResponse({ ok: false, error: String(err) })
          }
        })()
        return true
      }
      sendResponse({ ok: false, error: 'Side panel API not supported or no windowId' })
      return true
    }

    if (message?.type === 'GITHUB_PAGE_CHANGED') {
      const repo = message.repo || null
      ;(async () => {
        await setActiveRepoSession(repo)
        if (sender.tab?.id) {
          updateBadge(Boolean(repo), sender.tab.id)
        }
        // Broadcast to any open side panel or popup
        chrome.runtime.sendMessage({
          type: 'BROADCAST_ACTIVE_REPO',
          repo,
          tabId: sender.tab?.id,
          url: message.url,
        }).catch(() => {
          // Ignore when no listener is active
        })
        sendResponse({ ok: true })
      })()
      return true
    }

    if (message?.type === 'GET_ACTIVE_REPO_STATE') {
      ;(async () => {
        const repo = await getActiveRepoSession()
        sendResponse({ repo })
      })()
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
