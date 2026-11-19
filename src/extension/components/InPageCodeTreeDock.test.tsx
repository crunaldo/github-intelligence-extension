// @vitest-environment happy-dom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { InPageCodeTreeDock } from './InPageCodeTreeDock'
import type { TreeEntry } from '../../features/repository/types'

// @ts-expect-error test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('InPageCodeTreeDock', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  it('renders toggle handle and toggles open/close on click', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(
        <InPageCodeTreeDock
          owner="facebook"
          repo="react"
          isAnalyzed={false}
        />
      )
    })

    const toggleBtn = container.querySelector('.gpi-toggle-tab')
    expect(toggleBtn).not.toBeNull()

    const drawer = container.querySelector('.gpi-dock-drawer')
    expect(drawer?.className).toContain('closed')

    // Click toggle handle
    await React.act(async () => {
      toggleBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(drawer?.className).toContain('open')
  })

  it('renders CTA card when repo is not yet analyzed', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(
        <InPageCodeTreeDock
          owner="facebook"
          repo="react"
          isAnalyzed={false}
          defaultOpen={true}
        />
      )
    })

    expect(container.textContent).toContain('Analizar repositorio')
    expect(container.textContent).toContain('para explorar árbol')
  })

  it('renders file hierarchy and filters by search query when analyzed', async () => {
    const mockEntries: TreeEntry[] = [
      { path: 'src/index.ts', type: 'blob', size: 1200 },
      { path: 'src/components/Button.tsx', type: 'blob', size: 2400 },
      { path: 'package.json', type: 'blob', size: 850 },
    ]

    const root = createRoot(container)
    await React.act(async () => {
      root.render(
        <InPageCodeTreeDock
          owner="facebook"
          repo="react"
          isAnalyzed={true}
          initialEntries={mockEntries}
          defaultOpen={true}
        />
      )
    })

    expect(container.textContent).toContain('package.json')
    expect(container.textContent).toContain('src')

    // Filter by 'Button'
    const searchInput = container.querySelector('.gpi-search-input') as HTMLInputElement
    expect(searchInput).not.toBeNull()

    await React.act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set
      nativeInputValueSetter?.call(searchInput, 'Button')
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(container.textContent).toContain('Button.tsx')
  })
})
