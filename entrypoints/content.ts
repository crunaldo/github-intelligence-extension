export default defineContentScript({
  matches: ['*://github.com/*'],
  main() {
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

    function parseGitHubRepo(urlStr: string): { owner: string; repo: string; ref?: string; fullName: string; url: string } | null {
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

    let lastUrl = window.location.href

    function notifyNavigation() {
      const currentUrl = window.location.href
      const repo = parseGitHubRepo(currentUrl)
      lastUrl = currentUrl

      try {
        chrome.runtime.sendMessage({
          type: 'GITHUB_PAGE_CHANGED',
          url: currentUrl,
          repo,
        }).catch(() => {
          // Ignore if extension background is asleep
        })
      } catch {
        // Ignore context invalidated
      }
    }

    // Hook into GitHub's Turbo / PJAX navigation events
    document.addEventListener('turbo:load', notifyNavigation)
    document.addEventListener('turbo:render', notifyNavigation)
    document.addEventListener('pjax:end', notifyNavigation)
    window.addEventListener('popstate', notifyNavigation)

    // Polling observer for URL changes that don't fire events
    const observer = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        notifyNavigation()
      }
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })

    // Listen for direct queries from popup or sidepanel
    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      if (request?.type === 'GET_CURRENT_PAGE_REPO') {
        const repo = parseGitHubRepo(window.location.href)
        sendResponse({ repo, url: window.location.href })
        return true
      }
    })

    // Initial notification
    notifyNavigation()
  },
})
