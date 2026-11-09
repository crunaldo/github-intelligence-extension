import { extractRepoReference } from '../src/features/repository/github'
import type { GitHubTarget } from '../src/features/repository/types'

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const isGitHubSite = window.location.hostname.toLowerCase().includes('github.com')

    // =========================================================================
    // 1. GITHUB.COM NATIVE PAGE TRACKING (Maintains Turbo & PJAX listeners)
    // =========================================================================
    if (isGitHubSite) {
      const RESERVED_NAMES = new Set([
        'about', 'pricing', 'security', 'login', 'join', 'explore', 'trending',
        'collections', 'events', 'sponsors', 'features', 'enterprise', 'team',
        'search', 'settings', 'notifications', 'marketplace', 'pulls', 'issues',
        'dashboard', 'orgs', 'users', 'site', 'contact', 'status',
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
            // Ignore if background is asleep
          })
        } catch {
          // Ignore context invalidated
        }
      }

      document.addEventListener('turbo:load', notifyNavigation)
      document.addEventListener('turbo:render', notifyNavigation)
      document.addEventListener('pjax:end', notifyNavigation)
      window.addEventListener('popstate', notifyNavigation)

      const observer = new MutationObserver(() => {
        if (window.location.href !== lastUrl) {
          notifyNavigation()
        }
      })
      observer.observe(document.documentElement, { childList: true, subtree: true })

      chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        if (request?.type === 'GET_CURRENT_PAGE_REPO') {
          const repo = parseGitHubRepo(window.location.href)
          sendResponse({ repo, url: window.location.href })
          return true
        }
      })

      notifyNavigation()
    }

    // =========================================================================
    // 2. UNIVERSAL REPO DISCOVERY FLOATING BADGE (Safe Shadow DOM Overlay)
    // Works on Facebook, Instagram, Reddit, X/Twitter, blogs, Discord Web, etc.
    // =========================================================================
    let hostEl: HTMLDivElement | null = null
    let shadowRoot: ShadowRoot | null = null
    let pillEl: HTMLDivElement | null = null
    let activeTarget: GitHubTarget | null = null
    let hideTimeout: ReturnType<typeof setTimeout> | null = null

    function ensureShadowHost(): ShadowRoot {
      if (shadowRoot) return shadowRoot

      hostEl = document.createElement('div')
      hostEl.id = 'gpi-floating-pill-host'
      document.documentElement.appendChild(hostEl)

      shadowRoot = hostEl.attachShadow({ mode: 'closed' })

      const style = document.createElement('style')
      style.textContent = `
        :host {
          all: initial;
          position: fixed;
          top: 0;
          left: 0;
          width: 0;
          height: 0;
          z-index: 2147483647;
          pointer-events: none;
        }
        .gpi-pill {
          position: fixed;
          pointer-events: auto;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: #161b22;
          color: #f0f6fc;
          border: 1px solid #30363d;
          border-radius: 9999px;
          padding: 5px 12px 5px 9px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 11.5px;
          font-weight: 600;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
          cursor: pointer;
          opacity: 0;
          transform: translateY(6px) scale(0.96);
          transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
          user-select: none;
          white-space: nowrap;
        }
        .gpi-pill.is-visible {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        .gpi-pill:hover {
          background: #1c2128;
          border-color: #2ea043;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.65), 0 0 14px rgba(46, 160, 67, 0.35);
        }
        .gpi-octo-icon {
          width: 14px;
          height: 14px;
          fill: #f0f6fc;
          flex-shrink: 0;
        }
        .gpi-pill-text {
          color: #8b949e;
          font-size: 11px;
        }
        .gpi-pill-repo {
          color: #58a6ff;
          font-weight: 700;
        }
        .gpi-pill-badge {
          background: rgba(46, 160, 67, 0.18);
          color: #2ea043;
          border: 1px solid rgba(46, 160, 67, 0.4);
          font-size: 9.5px;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: 9999px;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .gpi-pill-arrow {
          color: #2ea043;
          font-size: 12px;
          font-weight: 700;
        }
      `
      shadowRoot.appendChild(style)

      pillEl = document.createElement('div')
      pillEl.className = 'gpi-pill'
      pillEl.innerHTML = `
        <svg class="gpi-octo-icon" viewBox="0 0 24 24">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"></path>
        </svg>
        <span class="gpi-pill-content"></span>
      `

      pillEl.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!activeTarget) return

        const content = pillEl?.querySelector('.gpi-pill-content')
        if (content) {
          content.innerHTML = '<span style="color:#2ea043;font-weight:700">✓ Abriendo en Sidepanel...</span>'
        }

        try {
          chrome.runtime.sendMessage({
            type: 'OPEN_SIDEPANEL_FOR_REPO',
            target: activeTarget,
          })
        } catch {
          // Ignore
        }

        setTimeout(() => hidePill(), 600)
      })

      shadowRoot.appendChild(pillEl)
      return shadowRoot
    }

    function showPillAt(rect: DOMRect, target: GitHubTarget) {
      if (hideTimeout) {
        clearTimeout(hideTimeout)
        hideTimeout = null
      }

      ensureShadowHost()
      if (!pillEl) return
      activeTarget = target

      const content = pillEl.querySelector('.gpi-pill-content')
      if (content) {
        content.innerHTML = `
          <span class="gpi-pill-text">Analizar</span>
          <span class="gpi-pill-repo">${target.owner}/${target.repository}</span>
          <span class="gpi-pill-badge">Sidepanel</span>
          <span class="gpi-pill-arrow">↗</span>
        `
      }

      // Compute optimal position: above the selection rect by default
      const pillHeight = 32
      const margin = 8
      let top = rect.top - pillHeight - margin

      // If too close to viewport top, flip below selection
      if (top < 10) {
        top = rect.bottom + margin
      }

      // Center horizontally relative to selection, clamped within screen
      const centerX = rect.left + rect.width / 2
      const estimatedWidth = 230
      let left = centerX - estimatedWidth / 2
      left = Math.max(12, Math.min(window.innerWidth - estimatedWidth - 12, left))

      pillEl.style.top = `${Math.round(top)}px`
      pillEl.style.left = `${Math.round(left)}px`
      pillEl.classList.add('is-visible')
    }

    function hidePill() {
      if (pillEl) {
        pillEl.classList.remove('is-visible')
      }
      activeTarget = null
    }

    // 1. Text selection listener (Mouse Up)
    document.addEventListener('mouseup', () => {
      setTimeout(() => {
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed) {
          return
        }

        const selectedText = selection.toString().trim()
        if (selectedText.length < 3 || selectedText.length > 300) {
          return
        }

        const target = extractRepoReference(selectedText)
        if (target) {
          try {
            const range = selection.getRangeAt(0)
            const rect = range.getBoundingClientRect()
            if (rect.width > 0 && rect.height > 0) {
              showPillAt(rect, target)
            }
          } catch {
            // Ignore range errors
          }
        }
      }, 20)
    })

    // 2. Hover listener on <a> links to GitHub
    let linkHoverTimeout: ReturnType<typeof setTimeout> | null = null

    document.addEventListener('mouseover', (e) => {
      const targetEl = e.target as HTMLElement | null
      const anchor = targetEl?.closest('a')
      if (!anchor || !anchor.href) return

      const href = anchor.href
      if (!href.includes('github.com/') && !href.startsWith('github/') && !href.startsWith('gh/')) return

      if (linkHoverTimeout) clearTimeout(linkHoverTimeout)
      linkHoverTimeout = setTimeout(() => {
        const target = extractRepoReference(href) || extractRepoReference(anchor.innerText || '')
        if (target) {
          const rect = anchor.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0) {
            showPillAt(rect, target)
          }
        }
      }, 350)
    })

    document.addEventListener('mouseout', (e) => {
      const targetEl = e.target as HTMLElement | null
      const anchor = targetEl?.closest('a')
      if (anchor && linkHoverTimeout) {
        clearTimeout(linkHoverTimeout)
      }
    })

    // 3. Dismiss on outside click, scroll, or Escape key
    document.addEventListener('mousedown', (e) => {
      if (hostEl && e.composedPath().includes(hostEl)) {
        return
      }
      hidePill()
    })

    window.addEventListener('scroll', () => {
      if (pillEl && pillEl.classList.contains('is-visible')) {
        hidePill()
      }
    }, { passive: true })

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hidePill()
      }
    })
  },
})
