// @vitest-environment happy-dom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { InPageCodeTreeDock } from './InPageCodeTreeDock'
import type { TreeEntry } from '../../features/repository/types'
import { DEFAULT_CODE_TREE_PREFERENCES } from '../storage'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../utils/treePathSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/treePathSync')>()
  return {
    ...actual,
    fetchRepoGitTree: vi.fn().mockResolvedValue([]),
  }
})

describe('InPageCodeTreeDock', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    try {
      sessionStorage.removeItem('gpi_code_tree_pinned')
      sessionStorage.removeItem('gpi_dock_is_open')
    } catch {}
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
      { path: 'src/index.ts', type: 'blob', size: 1200, sha: '1', url: '' },
      { path: 'src/components/Button.tsx', type: 'blob', size: 2400, sha: '2', url: '' },
      { path: 'package.json', type: 'blob', size: 850, sha: '3', url: '' },
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

  it('triggers onOpenSettings when settings icon button is clicked in header', async () => {
    const onOpenSettings = vi.fn()
    const root = createRoot(container)
    await React.act(async () => {
      root.render(
        <InPageCodeTreeDock
          owner="facebook"
          repo="react"
          isAnalyzed={true}
          defaultOpen={true}
          onOpenSettings={onOpenSettings}
        />
      )
    })

    const settingsBtn = container.querySelector('button[title*="Ajustes"]')
    expect(settingsBtn).not.toBeNull()

    await React.act(async () => {
      settingsBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onOpenSettings).toHaveBeenCalled()
  })

  it('opens on hover when hoverToOpen preference is enabled', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(
        <InPageCodeTreeDock
          owner="facebook"
          repo="react"
          codeTreePreferences={{
            ...DEFAULT_CODE_TREE_PREFERENCES,
            hoverToOpen: true,
            openFoldersOnClick: true,
            pinPerWindow: true,
            tabPosition: 'left',
            tabVerticalPos: 35,
            hideWhenUrlMatches: '',
            shortcut: 'Alt+W',
          }}
        />
      )
    })

    const toggleBtn = container.querySelector('.gpi-toggle-tab')
    const drawer = container.querySelector('.gpi-dock-drawer')
    expect(drawer?.className).toContain('closed')

    // Mouse enter / hover on toggle tab
    await React.act(async () => {
      toggleBtn?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })

    expect(drawer?.className).toContain('open')
  })

  it('renders right-positioned dock when tabPosition is right', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(
        <InPageCodeTreeDock
          owner="facebook"
          repo="react"
          codeTreePreferences={{
            ...DEFAULT_CODE_TREE_PREFERENCES,
            hoverToOpen: false,
            openFoldersOnClick: true,
            pinPerWindow: true,
            tabPosition: 'right',
            tabVerticalPos: 40,
            hideWhenUrlMatches: '',
            shortcut: 'Alt+W',
          }}
        />
      )
    })

    const dockContainer = container.querySelector('.gpi-dock-container')
    expect(dockContainer?.className).toContain('position-right')
  })

  it('hides dock when hideWhenUrlMatches matches window.location.href', async () => {
    const originalHref = window.location.href
    try {
      window.history.pushState({}, '', '/facebook/react/issues/123')
      const root = createRoot(container)
      await React.act(async () => {
        root.render(
          <InPageCodeTreeDock
            owner="facebook"
            repo="react"
            codeTreePreferences={{
              ...DEFAULT_CODE_TREE_PREFERENCES,
              hoverToOpen: false,
              openFoldersOnClick: true,
              pinPerWindow: true,
              tabPosition: 'left',
              tabVerticalPos: 20,
              hideWhenUrlMatches: 'issues, pulls',
              shortcut: 'Alt+W',
            }}
          />
        )
      })

      const toggleBtn = container.querySelector('.gpi-toggle-tab')
      expect(toggleBtn).toBeNull()
    } finally {
      window.history.pushState({}, '', originalHref)
    }
  })

  it('keeps dock open when clicking a file row (pinPerWindow)', async () => {
    const mockEntries: TreeEntry[] = [
      { path: 'src/index.ts', type: 'blob', size: 100, sha: '1', url: '' },
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
          codeTreePreferences={{
            ...DEFAULT_CODE_TREE_PREFERENCES,
            hoverToOpen: false,
            openFoldersOnClick: true,
            pinPerWindow: true,
            tabPosition: 'left',
            tabVerticalPos: 20,
            hideWhenUrlMatches: '',
            shortcut: 'Alt+W',
          }}
        />
      )
    })

    const fileLink = container.querySelector('a.gpi-tree-left') as HTMLAnchorElement
    expect(fileLink).not.toBeNull()

    await React.act(async () => {
      fileLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    const drawer = container.querySelector('.gpi-dock-drawer')
    expect(drawer?.className).toContain('open')
  })

  it('hides toggle tab when dock is open (.is-hidden)', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(
        <InPageCodeTreeDock
          owner="facebook"
          repo="react"
          isAnalyzed={true}
          defaultOpen={true}
        />
      )
    })

    const toggleBtn = container.querySelector('.gpi-toggle-tab')
    expect(toggleBtn?.className).toContain('is-hidden')
  })

  it('toggles pin state and saves to sessionStorage when pin button is clicked', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(
        <InPageCodeTreeDock
          owner="facebook"
          repo="react"
          isAnalyzed={true}
          defaultOpen={true}
        />
      )
    })

    const pinBtn = container.querySelector('button[title*="panel"]')
    expect(pinBtn).not.toBeNull()

    await React.act(async () => {
      pinBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(sessionStorage.getItem('gpi_code_tree_pinned')).toBe('false')
  })

  it('renders in-dock quick settings view when settings button is clicked', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(
        <InPageCodeTreeDock
          owner="facebook"
          repo="react"
          isAnalyzed={true}
          defaultOpen={true}
        />
      )
    })

    const settingsBtn = container.querySelector('button[title*="Ajustes"]')
    expect(settingsBtn).not.toBeNull()

    await React.act(async () => {
      settingsBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const inDockSettings = container.querySelector('.gpi-dock-settings-view')
    expect(inDockSettings).not.toBeNull()
    expect(inDockSettings?.textContent).toContain('Ajustes del Explorador')
  })

  it('renders PR changed files with additions, deletions, and diff status badges', async () => {
    const root = createRoot(container)
    const mockPrResolution = {
      isPrOrCommit: true,
      type: 'pr' as const,
      title: 'PR #28000: Add features',
      files: [
        {
          filename: 'src/components/Header.tsx',
          status: 'modified' as const,
          additions: 14,
          deletions: 2,
          changes: 16,
          diffAnchor: 'diff-header-anchor',
        },
        {
          filename: 'src/utils/newHelper.ts',
          status: 'added' as const,
          additions: 25,
          deletions: 0,
          changes: 25,
          diffAnchor: 'diff-helper-anchor',
        },
      ],
    }

    await React.act(async () => {
      root.render(
        <InPageCodeTreeDock
          owner="facebook"
          repo="react"
          isAnalyzed={false}
          defaultOpen={true}
          prOrCommitResolution={mockPrResolution}
        />
      )
    })

    const modeTabs = container.querySelector('.gpi-mode-tabs')
    expect(modeTabs).not.toBeNull()
    expect(modeTabs?.textContent).toContain('PR #28000')

    const fileRows = container.querySelectorAll('.gpi-tree-row')
    expect(fileRows.length).toBe(2)
    expect(container.textContent).toContain('src/components/Header.tsx')
    expect(container.textContent).toContain('+14')
    expect(container.textContent).toContain('-2')
    expect(container.textContent).toContain('src/utils/newHelper.ts')
    expect(container.textContent).toContain('+25')
  })

  it('re-renders and updates view when targetUrl navigates between PRs', async () => {
    const root = createRoot(container)
    const pr1 = {
      isPrOrCommit: true,
      type: 'pr' as const,
      title: 'PR #100',
      files: [{ filename: 'src/Old.ts', status: 'modified' as const, additions: 1, deletions: 1, changes: 2, diffAnchor: 'diff-1' }],
    }
    const pr2 = {
      isPrOrCommit: true,
      type: 'pr' as const,
      title: 'PR #101',
      files: [{ filename: 'src/New.ts', status: 'added' as const, additions: 5, deletions: 0, changes: 5, diffAnchor: 'diff-2' }],
    }

    await React.act(async () => {
      root.render(
        <InPageCodeTreeDock
          owner="facebook"
          repo="react"
          isAnalyzed={false}
          defaultOpen={true}
          prOrCommitResolution={pr1}
          targetUrl="https://github.com/facebook/react/pull/100"
        />
      )
    })

    expect(container.textContent).toContain('src/Old.ts')

    // Navigate to PR 101
    await React.act(async () => {
      root.render(
        <InPageCodeTreeDock
          owner="facebook"
          repo="react"
          isAnalyzed={false}
          defaultOpen={true}
          prOrCommitResolution={pr2}
          targetUrl="https://github.com/facebook/react/pull/101"
        />
      )
    })

    expect(container.textContent).toContain('src/New.ts')
    expect(container.textContent).not.toContain('src/Old.ts')
  })

  it('synchronizes with GitHub URL in real-time, auto-expands ancestors and marks active file', async () => {
    const mockEntries: TreeEntry[] = [
      { path: 'src/index.ts', type: 'blob', size: 100, sha: '1', url: '' },
      { path: 'src/components/ui/Button.tsx', type: 'blob', size: 200, sha: '2', url: '' },
      { path: 'docs/readme.md', type: 'blob', size: 300, sha: '3', url: '' },
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
          targetUrl="https://github.com/facebook/react/blob/main/src/components/ui/Button.tsx"
        />
      )
    })

    // Button.tsx should be visible because src, src/components, and src/components/ui were auto-expanded
    expect(container.textContent).toContain('Button.tsx')

    const activeItem = container.querySelector('.gpi-tree-row.is-active-item')
    expect(activeItem).not.toBeNull()
    expect(activeItem?.textContent).toContain('Button.tsx')
  })

  it('preserves open folders on click and saves state to storage', async () => {
    const mockEntries: TreeEntry[] = [
      { path: 'src/index.ts', type: 'blob', size: 100, sha: '1', url: '' },
      { path: 'src/utils/math.ts', type: 'blob', size: 200, sha: '2', url: '' },
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
          targetUrl="https://github.com/facebook/react"
        />
      )
    })

    // 1. Expand src/utils folder
    const utilsFolder = Array.from(container.querySelectorAll('.gpi-tree-row')).find((el) =>
      el.textContent?.includes('utils')
    )
    expect(utilsFolder).not.toBeNull()
    await React.act(async () => {
      utilsFolder?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // 2. Now math.ts is visible in the tree - click on math.ts link
    const mathRow = Array.from(container.querySelectorAll('.gpi-tree-row')).find((el) =>
      el.textContent?.includes('math.ts')
    )
    const mathLink = mathRow?.querySelector('a')
    expect(mathLink).not.toBeNull()

    await React.act(async () => {
      mathLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    // The math.ts row should now be marked as active item
    const activeRow = container.querySelector('.gpi-tree-row.is-active-item')
    expect(activeRow).not.toBeNull()
    expect(activeRow?.textContent).toContain('math.ts')

    // Saved in sessionStorage
    const stored = sessionStorage.getItem('gpi_tree_folders_facebook_react')
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored || '{}')
    expect(parsed.src).toBe(true)
    expect(parsed['src/utils']).toBe(true)
  })

  it('respects language="en" prop and translates UI to English', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(
        <InPageCodeTreeDock
          owner="facebook"
          repo="react"
          isAnalyzed={false}
          defaultOpen={true}
          language="en"
        />
      )
    })

    // English CTA
    expect(container.textContent).toContain('Repository not analyzed')
    expect(container.textContent).toContain('Analyze repository (1 click)')

    // English toggle/header titles
    const settingsBtn = container.querySelector('button[title*="Settings"]')
    expect(settingsBtn).not.toBeNull()

    // Switch to quick settings
    await React.act(async () => {
      settingsBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const inDockSettings = container.querySelector('.gpi-dock-settings-view')
    expect(inDockSettings?.textContent).toContain('Explorer Settings')
    expect(inDockSettings?.textContent).toContain('Screen side')
    expect(inDockSettings?.textContent).toContain('Left')
    expect(inDockSettings?.textContent).toContain('Right')
    expect(inDockSettings?.textContent).toContain('Open settings in Sidepanel')
    expect(inDockSettings?.textContent).toContain('Back to file tree')

    await React.act(async () => {
      root.unmount()
    })
  })

  it('respects language="es" prop and translates UI to Spanish', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(
        <InPageCodeTreeDock
          owner="facebook"
          repo="react"
          isAnalyzed={false}
          defaultOpen={true}
          language="es"
        />
      )
    })

    // Spanish CTA
    expect(container.textContent).toContain('Repositorio no analizado')
    expect(container.textContent).toContain('Analizar repositorio (1 clic)')

    // Spanish settings button
    const settingsBtn = container.querySelector('button[title*="Ajustes"]')
    expect(settingsBtn).not.toBeNull()

    // Switch to quick settings
    await React.act(async () => {
      settingsBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const inDockSettings = container.querySelector('.gpi-dock-settings-view')
    expect(inDockSettings?.textContent).toContain('Ajustes del Explorador')
    expect(inDockSettings?.textContent).toContain('Lado de la pantalla')
    expect(inDockSettings?.textContent).toContain('Izquierda')
    expect(inDockSettings?.textContent).toContain('Derecha')
    expect(inDockSettings?.textContent).toContain('Abrir ajustes en Panel Lateral')
    expect(inDockSettings?.textContent).toContain('Volver al árbol de archivos')

    await React.act(async () => {
      root.unmount()
    })
  })
})
