// @vitest-environment happy-dom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { SettingsView } from './SettingsView'
import { DEFAULT_EXTENSION_PREFERENCES } from '../storage'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('SettingsView - Code Tree Settings', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  it('renders Code Tree settings card with all controls', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(
        <SettingsView
          preferences={DEFAULT_EXTENSION_PREFERENCES}
          onSavePreferences={vi.fn()}
          onClearCache={vi.fn()}
          locale="es"
        />
      )
    })

    const codeTreeCard = container.querySelector('#code-tree-settings')
    expect(codeTreeCard).not.toBeNull()
    expect(codeTreeCard?.textContent).toContain('Árbol de Código Lateral')
    expect(codeTreeCard?.textContent).toContain('Hover to open')
    expect(codeTreeCard?.textContent).toContain('Open folders on click')
    expect(codeTreeCard?.textContent).toContain('Pin per window')
    expect(codeTreeCard?.textContent).toContain('Izquierda')
    expect(codeTreeCard?.textContent).toContain('Derecha')
  })

  it('calls onSavePreferences when changing hoverToOpen or pinPerWindow', async () => {
    const onSavePreferences = vi.fn().mockResolvedValue(undefined)
    const root = createRoot(container)
    await React.act(async () => {
      root.render(
        <SettingsView
          preferences={DEFAULT_EXTENSION_PREFERENCES}
          onSavePreferences={onSavePreferences}
          onClearCache={vi.fn()}
          locale="es"
        />
      )
    })

    const checkboxes = container.querySelectorAll<HTMLInputElement>('#code-tree-settings input[type="checkbox"]')
    expect(checkboxes.length).toBeGreaterThanOrEqual(3)

    // Toggle hoverToOpen checkbox (3rd checkbox in codeTree settings)
    const hoverCheckbox = checkboxes[2]
    await React.act(async () => {
      hoverCheckbox.click()
    })

    expect(onSavePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        codeTree: expect.objectContaining({ hoverToOpen: true }),
      })
    )
  })
})
