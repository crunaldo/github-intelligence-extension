import { DOCK_CSS } from './dockStyles'

export const DOCK_HOST_ID = 'gpi-code-tree-host'

export function getGitHubTheme(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark'

  const html = document.documentElement
  const colorMode = html.getAttribute('data-color-mode')
  if (colorMode === 'light') return 'light'
  if (colorMode === 'dark') return 'dark'

  const darkTheme = html.getAttribute('data-dark-theme')
  if (darkTheme && darkTheme.includes('dark')) return 'dark'

  const lightTheme = html.getAttribute('data-light-theme')
  if (lightTheme && lightTheme.includes('light')) return 'light'

  // Match system preference fallback
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light'
  }

  return 'dark'
}

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
  }

  const cleanup = () => {
    if (host && host.parentNode) {
      host.parentNode.removeChild(host)
    }
  }

  return { host, shadowRoot, cleanup }
}
