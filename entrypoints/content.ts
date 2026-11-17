import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  FloatingMascot,
  MASCOT_SHADOW_STYLES,
  type FloatingMascotRepo,
} from '../src/features/mascot/FloatingMascot'
import {
  extractRepoReference,
  extractRepoFromAnchorData,
  RESERVED_GITHUB_NAMES,
} from '../src/features/repository/github'
import type { GitHubTarget } from '../src/features/repository/types'

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const currentHostname = window.location.hostname.toLowerCase()
    const isGitHubSite = currentHostname === 'github.com' || currentHostname === 'www.github.com'

    // =========================================================================
    // 1. GITHUB.COM NATIVE PAGE TRACKING (Maintains Turbo & PJAX listeners)
    // =========================================================================
    let mascotHostEl: HTMLDivElement | null = null

    if (isGitHubSite) {
      function parseGitHubRepo(urlStr: string): { owner: string; repo: string; ref?: string; fullName: string; url: string } | null {
        try {
          const url = new URL(urlStr)
          const host = url.hostname.toLowerCase()
          if (host !== 'github.com' && host !== 'www.github.com') return null
          const parts = url.pathname.split('/').filter(Boolean)
          if (parts.length < 2) return null

          const owner = parts[0]
          const repo = parts[1].replace(/\.git$/i, '')

          if (RESERVED_GITHUB_NAMES.has(owner.toLowerCase())) return null

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

      function extractCommitShaFromDom(owner: string, repo: string): string | undefined {
        try {
          const escapedOwner = owner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const escapedRepo = repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const commitHrefPattern = new RegExp(
            `^/${escapedOwner}/${escapedRepo}/commit/([0-9a-f]{7,40})(?:[/?#]|$)`,
            'i'
          )

          const prioritySelectors = [
            '[data-testid*="latest-commit"] a[href*="/commit/"]',
            '.commit-tease a[href*="/commit/"]',
            'main a[href*="/commit/"]',
            'a[href*="/commit/"]',
          ]
          for (const selector of prioritySelectors) {
            const links = document.querySelectorAll(selector)
            for (const link of links) {
              const rawHref = link.getAttribute('href') || ''
              let pathname = rawHref
              if (rawHref.startsWith('http')) {
                try {
                  pathname = new URL(rawHref).pathname
                } catch {
                  continue
                }
              }
              const match = commitHrefPattern.exec(pathname)
              if (match?.[1]) {
                return match[1]
              }
            }
          }

          const embeddedScripts = document.querySelectorAll(
            'script[data-target="react-app.embeddedData"]'
          )
          for (const script of embeddedScripts) {
            const content = script.textContent || ''
            const oidMatch = /"currentOid"\s*:\s*"([0-9a-f]{7,40})"/i.exec(content)
            if (oidMatch?.[1]) {
              return oidMatch[1]
            }
          }
        } catch {
          // Fall back cleanly when GitHub DOM structure is unavailable
        }
        return undefined
      }

      let mascotRoot: Root | null = null

      function renderFloatingMascot(activeRepo: FloatingMascotRepo | null) {
        if (!mascotHostEl) {
          mascotHostEl = document.createElement('div')
          mascotHostEl.id = 'gpi-mascot-host'
          document.documentElement.appendChild(mascotHostEl)

          const mascotShadow = mascotHostEl.attachShadow({ mode: 'open' })
          const styleEl = document.createElement('style')
          styleEl.textContent = MASCOT_SHADOW_STYLES
          mascotShadow.appendChild(styleEl)

          const mountEl = document.createElement('div')
          mascotShadow.appendChild(mountEl)
          mascotRoot = createRoot(mountEl)
        }

        mascotRoot?.render(React.createElement(FloatingMascot, { repo: activeRepo }))
      }

      let lastUrl = window.location.href

      function notifyNavigation() {
        const currentUrl = window.location.href
        const repo = parseGitHubRepo(currentUrl)
        lastUrl = currentUrl

        const resolvedSha = repo
          ? (/^[0-9a-f]{7,40}$/i.test(repo.ref || '')
              ? repo.ref
              : extractCommitShaFromDom(repo.owner, repo.repo)) || repo.ref
          : undefined

        renderFloatingMascot(
          repo
            ? {
                owner: repo.owner,
                repo: repo.repo,
                ...(resolvedSha ? { commitSha: resolvedSha } : {}),
              }
            : null
        )

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

      // Use mode: 'open' so Chrome event dispatch & user activation tracking recognizes clicks across shadow boundary
      shadowRoot = hostEl.attachShadow({ mode: 'open' })

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

      pillEl.addEventListener('click', () => {
        const targetToOpen = activeTarget
        if (!targetToOpen) return

        // 1. Immediately send message on click tick without ANY await or pre-DOM delays
        try {
          chrome.runtime.sendMessage({
            type: 'OPEN_SIDEPANEL_FOR_REPO',
            target: targetToOpen,
          }, (response) => {
            if (response && response.ok === false) {
              const content = pillEl?.querySelector('.gpi-pill-content')
              if (content) {
                content.innerHTML = '<span style="color:#58a6ff;font-weight:700">✓ ¡Listo! Abre el panel lateral 🧩</span>'
              }
            }
          })
        } catch {
          // Ignore
        }

        const content = pillEl?.querySelector('.gpi-pill-content')
        if (content) {
          content.innerHTML = '<span style="color:#2ea043;font-weight:700">✓ Abriendo en Sidepanel...</span>'
        }

        setTimeout(() => hidePill(), 1000)
      })

      pillEl.addEventListener('mouseenter', () => {
        if (hideTimeout) {
          clearTimeout(hideTimeout)
          hideTimeout = null
        }
      })

      pillEl.addEventListener('mouseleave', () => {
        hideTimeout = setTimeout(() => hidePill(), 600)
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

      // If too close to viewport top, flip below selection, clamped inside viewport
      if (top < 10) {
        top = rect.bottom + margin
      }
      top = Math.max(10, Math.min(window.innerHeight - pillHeight - 10, top))

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

    function findAnchorElement(targetEl: Element | null): HTMLElement | null {
      if (!targetEl) return null
      const anchor = targetEl.closest('a, [data-href], [role="link"]') as HTMLElement | null
      if (!anchor) return null

      // Ignore large non-<a> SPA container cards (e.g. Facebook/X role="link" wrappers)
      if (anchor.tagName !== 'A' && !anchor.hasAttribute('data-href')) {
        if (anchor.querySelector('a[href]')) return null
        const text = (anchor.textContent || '').trim()
        if (text.length > 200) return null
      }

      return anchor
    }

    /**
     * Strict repository resolver from an anchor element or its children.
     * Avoids false positives on relative non-GitHub links (/groups/123, /r/programming)
     * and non-GitHub link labels (UI/UX, CI/CD, dates).
     */
    function extractTargetFromElement(el: Element | null): GitHubTarget | null {
      const anchor = findAnchorElement(el)
      if (!anchor) return null

      const rawHref = anchor.getAttribute('href') || anchor.getAttribute('data-href') || ''
      const anchorHrefProp = (anchor as HTMLAnchorElement).href
      const fullHref = typeof anchorHrefProp === 'string' ? anchorHrefProp : ''
      const innerText = (anchor.innerText || (el as HTMLElement)?.innerText || anchor.textContent || '').trim()
      const title = anchor.getAttribute('title') || el?.getAttribute('title') || ''

      return extractRepoFromAnchorData({
        rawHref,
        fullHref,
        innerText,
        title,
        pageHostname: currentHostname,
      })
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

    // 2. Capture-phase right click listener to guarantee we identify the clicked repo even on complex SPAs (Facebook, Reddit, Twitter, GitHub)
    document.addEventListener('contextmenu', (e) => {
      const targetEl = e.target as Element | null
      const repo = extractTargetFromElement(targetEl) || (window.getSelection() ? extractRepoReference(window.getSelection()?.toString() || '') : null)

      try {
        chrome.runtime.sendMessage({
          type: 'LAST_RIGHT_CLICK_REPO',
          target: repo,
          url: repo?.originalUrl ?? null,
        }).catch(() => {})
      } catch {
        // Ignore
      }
    }, true)

    // 3. Hover listener on <a> links to GitHub (works on GitHub.com, Facebook, Reddit, Twitter, blogs, etc.)
    let linkHoverTimeout: ReturnType<typeof setTimeout> | null = null
    let currentHoverAnchor: HTMLElement | null = null

    document.addEventListener('mouseover', (e) => {
      const targetEl = e.target as Element | null
      if (!targetEl) return

      if (mascotHostEl && e.composedPath().includes(mascotHostEl)) {
        return
      }

      // Don't trigger or hide if hovering over the floating pill itself
      if (hostEl && e.composedPath().includes(hostEl)) {
        if (hideTimeout) {
          clearTimeout(hideTimeout)
          hideTimeout = null
        }
        return
      }

      const anchor = findAnchorElement(targetEl)
      if (!anchor) return

      if (anchor === currentHoverAnchor && pillEl?.classList.contains('is-visible')) {
        if (hideTimeout) {
          clearTimeout(hideTimeout)
          hideTimeout = null
        }
        return
      }

      const target = extractTargetFromElement(anchor)
      if (!target) {
        if (linkHoverTimeout) {
          clearTimeout(linkHoverTimeout)
          linkHoverTimeout = null
        }
        currentHoverAnchor = null
        return
      }

      if (linkHoverTimeout) clearTimeout(linkHoverTimeout)
      if (hideTimeout) {
        clearTimeout(hideTimeout)
        hideTimeout = null
      }
      currentHoverAnchor = anchor

      linkHoverTimeout = setTimeout(() => {
        if (!document.contains(anchor)) return
        const rect = anchor.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          showPillAt(rect, target)
        }
      }, 180)
    })

    document.addEventListener('mouseout', (e) => {
      const targetEl = e.target as Element | null
      const anchor = findAnchorElement(targetEl)
      if (!anchor || anchor !== currentHoverAnchor) return

      const related = e.relatedTarget as Node | null
      if (related && anchor.contains(related)) return

      if (linkHoverTimeout) {
        clearTimeout(linkHoverTimeout)
        linkHoverTimeout = null
      }
      // Grace period before hiding pill in case user is moving mouse onto the pill
      if (pillEl && pillEl.classList.contains('is-visible')) {
        if (hideTimeout) clearTimeout(hideTimeout)
        hideTimeout = setTimeout(() => hidePill(), 750)
      }
      currentHoverAnchor = null
    })

    // 4. Dismiss on outside click, scroll, or Escape key
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
