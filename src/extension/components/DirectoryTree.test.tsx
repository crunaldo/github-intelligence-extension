// @vitest-environment happy-dom
import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { DirectoryTree } from './DirectoryTree'
import type { TreeEntry } from '../../features/repository/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('DirectoryTree', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  const mockEntries: TreeEntry[] = [
    { path: 'src/index.ts', type: 'blob', size: 1200, sha: '1', url: '' },
    { path: 'src/components/Button.tsx', type: 'blob', size: 2400, sha: '2', url: '' },
    { path: 'README.md', type: 'blob', size: 450, sha: '3', url: '' },
  ]

  it('renders in Spanish by default or when locale="es"', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(
        <DirectoryTree
          entries={mockEntries}
          repoHtmlUrl="https://github.com/facebook/react"
          locale="es"
        />
      )
    })

    const input = container.querySelector('.directory-tree-input') as HTMLInputElement
    expect(input?.placeholder).toContain('Filtrar archivos')
    expect(container.textContent).toContain('archivos')

    const githubLink = container.querySelector('.tree-github-link')
    expect(githubLink?.getAttribute('title')).toBe('Ver archivo en GitHub')

    await React.act(async () => {
      root.unmount()
    })
  })

  it('renders in English when locale="en"', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(
        <DirectoryTree
          entries={mockEntries}
          repoHtmlUrl="https://github.com/facebook/react"
          locale="en"
        />
      )
    })

    const input = container.querySelector('.directory-tree-input') as HTMLInputElement
    expect(input?.placeholder).toContain('Filter files')
    expect(container.textContent).toContain('files')

    const githubLink = container.querySelector('.tree-github-link')
    expect(githubLink?.getAttribute('title')).toBe('View file on GitHub')

    await React.act(async () => {
      root.unmount()
    })
  })

  it('shows translated empty state when search matches nothing', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(
        <DirectoryTree
          entries={[]}
          repoHtmlUrl="https://github.com/facebook/react"
          locale="en"
        />
      )
    })

    expect(container.textContent).toContain('No matching files found')

    await React.act(async () => {
      root.render(
        <DirectoryTree
          entries={[]}
          repoHtmlUrl="https://github.com/facebook/react"
          locale="es"
        />
      )
    })

    expect(container.textContent).toContain('No se encontraron archivos que coincidan')

    await React.act(async () => {
      root.unmount()
    })
  })
})
