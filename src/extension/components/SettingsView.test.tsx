// @vitest-environment happy-dom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { SettingsView } from './SettingsView'
import { DEFAULT_EXTENSION_PREFERENCES } from '../storage'
import * as supabaseAuth from '../auth/supabaseAuth'

vi.mock('../auth/supabaseAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth/supabaseAuth')>()
  return {
    ...actual,
    getAuthSession: vi.fn().mockResolvedValue(null),
    refreshProStatus: vi.fn().mockResolvedValue(null),
  }
})

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('SettingsView - Collapsible Sections and Pro Plan', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  it('renders Pro Plan card directly as non-collapsible hero card', async () => {
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

    const proCard = container.querySelector('.pro-plan-hero-card')
    expect(proCard).not.toBeNull()
    expect(proCard?.textContent).toContain('Plan Pro & Autenticación')
    expect(proCard?.textContent).toContain('PLAN FREE')
    expect(proCard?.textContent).toContain('Árbol de código en página')
    expect(proCard?.textContent).toContain('Auditoría técnica profunda')
    expect(proCard?.textContent).toContain('Mascota Asistente Octo')
    expect(proCard?.textContent).toContain('$4.99')
  })

  it('hides checklist and price when user has active Pro membership', async () => {
    vi.mocked(supabaseAuth.getAuthSession).mockResolvedValueOnce({
      accessToken: 'token-123',
      user: { id: 'usr_1', userName: 'pro_developer' },
      isPro: true,
    })

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

    const proCard = container.querySelector('.pro-plan-hero-card')
    expect(proCard).not.toBeNull()
    expect(proCard?.textContent).toContain('PRO ACTIVO')
    expect(proCard?.textContent).toContain('@pro_developer')
    // No checklist when Pro
    expect(proCard?.textContent).not.toContain('Árbol de código en página')
    expect(proCard?.textContent).not.toContain('Auditoría técnica profunda')
    // No price when connected
    expect(proCard?.textContent).not.toContain('$4.99')
  })

  it('hides price when user is connected to GitHub on Free plan', async () => {
    vi.mocked(supabaseAuth.getAuthSession).mockResolvedValueOnce({
      accessToken: 'token-456',
      user: { id: 'usr_2', userName: 'free_developer' },
      isPro: false,
    })

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

    const proCard = container.querySelector('.pro-plan-hero-card')
    expect(proCard).not.toBeNull()
    expect(proCard?.textContent).toContain('PLAN FREE')
    expect(proCard?.textContent).toContain('@free_developer')
    // Shows checklist for Free plan
    expect(proCard?.textContent).toContain('Árbol de código en página')
    // Does NOT show price when connected
    expect(proCard?.textContent).not.toContain('$4.99')
    // Upgrade button without price in label
    expect(proCard?.textContent).toContain('Mejorar a Pro')
  })

  it('has heavy sections collapsed by default and expands them on header click', async () => {
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
    // Collapsed by default: inner options are not in DOM
    expect(codeTreeCard?.textContent).not.toContain('Hover to open')

    // Click header to expand
    const header = codeTreeCard?.firstElementChild as HTMLElement
    expect(header).not.toBeNull()

    await React.act(async () => {
      header.click()
    })

    // Now expanded
    expect(codeTreeCard?.textContent).toContain('Hover to open')
    expect(codeTreeCard?.textContent).toContain('Pin per window')

    // Click again to collapse
    await React.act(async () => {
      header.click()
    })

    expect(codeTreeCard?.textContent).not.toContain('Hover to open')
  })

  it('calls onSavePreferences when changing hoverToOpen or pinPerWindow in expanded Code Tree', async () => {
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

    // Expand code tree section
    const header = container.querySelector('#code-tree-settings > div') as HTMLElement
    await React.act(async () => {
      header.click()
    })

    const checkboxes = container.querySelectorAll<HTMLInputElement>('#code-tree-settings input[type="checkbox"]')
    expect(checkboxes.length).toBeGreaterThanOrEqual(4)

    // Toggle hoverToOpen checkbox (4th checkbox now that master toggle is 1st)
    const hoverCheckbox = checkboxes[3]
    await React.act(async () => {
      hoverCheckbox.click()
    })

    expect(onSavePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        codeTree: expect.objectContaining({ hoverToOpen: true }),
      })
    )
  })

  it('allows disabling the code tree feature completely via master toggle in expanded card', async () => {
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

    // Expand code tree section
    const header = container.querySelector('#code-tree-settings > div') as HTMLElement
    await React.act(async () => {
      header.click()
    })

    const masterToggle = container.querySelector<HTMLInputElement>(
      'input[aria-label="Habilitar explorador de código en GitHub"]'
    )
    expect(masterToggle).not.toBeNull()
    expect(masterToggle?.checked).toBe(true)

    await React.act(async () => {
      masterToggle?.click()
    })

    expect(onSavePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        codeTree: expect.objectContaining({ enabled: false }),
      })
    )
  })

  it('renders Icon Theme buttons and switches theme on click after expanding Code Tree', async () => {
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

    // Expand code tree section
    const header = container.querySelector('#code-tree-settings > div') as HTMLElement
    await React.act(async () => {
      header.click()
    })

    const setiBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Seti UI'))
    expect(setiBtn).toBeDefined()

    await React.act(async () => {
      setiBtn?.click()
    })

    expect(onSavePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        codeTree: expect.objectContaining({ iconTheme: 'seti' }),
      })
    )
  })

  it('renders Token Profiles manager and allows adding a new token profile after expanding', async () => {
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

    // Expand token profiles section
    const header = container.querySelector('#token-profiles-settings > div') as HTMLElement
    await React.act(async () => {
      header.click()
    })

    const tokenProfilesCard = container.querySelector('#token-profiles-settings')
    expect(tokenProfilesCard).not.toBeNull()
    expect(tokenProfilesCard?.textContent).toContain('Perfiles de Token')

    const labelInput = tokenProfilesCard?.querySelector<HTMLInputElement>('input[placeholder*="Etiqueta"]')
    const tokenInput = tokenProfilesCard?.querySelector<HTMLInputElement>('input[placeholder*="ghp_"]')
    const addBtn = Array.from(tokenProfilesCard?.querySelectorAll('button') || []).find((b) => b.textContent?.includes('Agregar Token'))

    expect(labelInput).not.toBeNull()
    expect(tokenInput).not.toBeNull()
    expect(addBtn).toBeDefined()

    await React.act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      if (labelInput && nativeSetter) {
        nativeSetter.call(labelInput, 'Work Profile')
        labelInput.dispatchEvent(new Event('input', { bubbles: true }))
        labelInput.dispatchEvent(new Event('change', { bubbles: true }))
      }
      if (tokenInput && nativeSetter) {
        nativeSetter.call(tokenInput, 'ghp_work_secret_12345')
        tokenInput.dispatchEvent(new Event('input', { bubbles: true }))
        tokenInput.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })

    await React.act(async () => {
      addBtn?.click()
    })

    expect(onSavePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenProfiles: expect.arrayContaining([
          expect.objectContaining({ label: 'Work Profile', token: 'ghp_work_secret_12345' }),
        ]),
        githubToken: 'ghp_work_secret_12345',
      })
    )
  })

  it('clears githubToken when active profile is deleted after expanding', async () => {
    const onSavePreferences = vi.fn().mockResolvedValue(undefined)
    const root = createRoot(container)
    const prefsWithProfile = {
      ...DEFAULT_EXTENSION_PREFERENCES,
      githubToken: 'ghp_active_secret',
      activeProfileId: 'work_1',
      tokenProfiles: [
        { id: 'work_1', label: 'Work', token: 'ghp_active_secret' },
      ],
    }

    await React.act(async () => {
      root.render(
        <SettingsView
          preferences={prefsWithProfile}
          onSavePreferences={onSavePreferences}
          onClearCache={vi.fn()}
          locale="es"
        />
      )
    })

    // Expand token profiles section
    const header = container.querySelector('#token-profiles-settings > div') as HTMLElement
    await React.act(async () => {
      header.click()
    })

    const deleteBtn = container.querySelector('#token-profiles-settings button[title*="Eliminar"]') as HTMLButtonElement
    expect(deleteBtn).not.toBeNull()

    await React.act(async () => {
      deleteBtn.click()
    })

    expect(onSavePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenProfiles: [],
        activeProfileId: 'default',
        githubToken: '',
      })
    )
  })
})
