import { DOCK_CSS } from './dockStyles'

export const DOCK_HOST_ID = 'gpi-code-tree-host'

export function getGitHubTheme(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark'

  const html = document.documentElement
  const colorMode = html.getAttribute('data-color-mode')

  if (colorMode === 'light') return 'light'
  if (colorMode === 'dark') return 'dark'

  // If colorMode is 'auto' or unset, check system preference first
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches

  if (colorMode === 'auto') {
    return prefersDark ? 'dark' : 'light'
  }

  const darkTheme = html.getAttribute('data-dark-theme')
  if (darkTheme && darkTheme.includes('dark')) return 'dark'

  const lightTheme = html.getAttribute('data-light-theme')
  if (lightTheme && lightTheme.includes('light')) return 'light'

  return prefersDark ? 'dark' : 'light'
}

let themeObserver: MutationObserver | null = null

export function injectCodeTreeHost(): {
  host: HTMLElement
  shadowRoot: ShadowRoot
  cleanup: () => void
} {
  let host = document.getElementById(DOCK_HOST_ID)

  if (!host) {
    host = document.createElement('div')
    host.id = DOCK_HOST_ID
    document.documentElement.appendChild(host)
  }

  let shadowRoot = host.shadowRoot
  if (!shadowRoot) {
    shadowRoot = host.attachShadow({ mode: 'open' })

    const styleEl = document.createElement('style')
    styleEl.textContent = DOCK_CSS
    shadowRoot.appendChild(styleEl)

    // Set initial theme attribute
    const theme = getGitHubTheme()
    host.setAttribute('data-theme', theme)

    // Observe theme attribute changes on document.documentElement
    if (typeof MutationObserver !== 'undefined' && !themeObserver) {
      themeObserver = new MutationObserver(() => {
        const currentHost = document.getElementById(DOCK_HOST_ID)
        if (currentHost) {
          currentHost.setAttribute('data-theme', getGitHubTheme())
        }
      })
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-color-mode', 'data-dark-theme', 'data-light-theme'],
      })
    }
  }

  const cleanup = () => {
    if (themeObserver) {
      themeObserver.disconnect()
      themeObserver = null
    }
    if (host && host.parentNode) {
      host.parentNode.removeChild(host)
    }
  }

  return { host, shadowRoot, cleanup }
}
