// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { injectCodeTreeHost, getGitHubTheme } from './dockHost'

describe('dockHost', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = ''
  })

  afterEach(() => {
    const existing = document.getElementById('gpi-code-tree-host')
    if (existing) existing.remove()
  })

  it('injects host element with open Shadow DOM attached', () => {
    const { host, shadowRoot, cleanup } = injectCodeTreeHost()
    expect(host).toBeDefined()
    expect(host.id).toBe('gpi-code-tree-host')
    expect(document.documentElement.contains(host)).toBe(true)
    expect(shadowRoot).toBeDefined()
    expect(shadowRoot.mode).toBe('open')

    cleanup()
    expect(document.documentElement.contains(host)).toBe(false)
  })

  it('does not create duplicate hosts on subsequent calls', () => {
    const res1 = injectCodeTreeHost()
    const res2 = injectCodeTreeHost()
    expect(res1.host).toBe(res2.host)
    expect(document.querySelectorAll('#gpi-code-tree-host').length).toBe(1)
    res1.cleanup()
  })

  it('detects GitHub color mode correctly including auto mode', () => {
    document.documentElement.setAttribute('data-color-mode', 'dark')
    expect(getGitHubTheme()).toBe('dark')

    document.documentElement.setAttribute('data-color-mode', 'light')
    expect(getGitHubTheme()).toBe('light')

    // GitHub default: data-color-mode="auto" with system light mode
    document.documentElement.setAttribute('data-color-mode', 'auto')
    document.documentElement.setAttribute('data-dark-theme', 'dark')
    document.documentElement.setAttribute('data-light-theme', 'light')
    window.matchMedia = () => ({ matches: false } as MediaQueryList) // not dark -> light
    expect(getGitHubTheme()).toBe('light')

    // System dark mode
    window.matchMedia = () => ({ matches: true } as MediaQueryList) // dark -> dark
    expect(getGitHubTheme()).toBe('dark')

    document.documentElement.removeAttribute('data-color-mode')
    document.documentElement.setAttribute('data-dark-theme', 'dark_dimmed')
    expect(getGitHubTheme()).toBe('dark')
  })
})
