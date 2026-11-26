// @vitest-environment happy-dom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { UserFeedbackWidget } from './UserFeedbackWidget'
import * as backendClient from '../api/backendClient'

vi.mock('../api/backendClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/backendClient')>()
  return {
    ...actual,
    submitUserFeedback: vi.fn().mockResolvedValue({ success: true, id: 'fb_123' }),
    fetchRemoteConfig: vi.fn().mockResolvedValue({
      freeDailyLimit: 15,
      proDailyLimit: 250,
      featureFlags: { enableMascot: true, enableDiagrams: true, maintenanceMode: false },
      feedbackLocations: {
        repo_explanation: true,
        architecture: true,
        file_explainer: true,
        mascot: true,
        overview: true,
      },
    }),
  }
})

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('UserFeedbackWidget', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    vi.clearAllMocks()
  })

  it('renders initial question and feedback buttons', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(<UserFeedbackWidget repo="facebook/react" locale="es" />)
    })

    expect(container.textContent).toContain('¿Te resultó útil este análisis?')
    expect(container.textContent).toContain('Útil')
    expect(container.textContent).toContain('Mejorable')
  })

  it('clicking positive rating calls submitUserFeedback and opens details form', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(<UserFeedbackWidget repo="facebook/react" locale="es" provider="cfAi" />)
    })

    const buttons = container.querySelectorAll('button')
    const thumbsUpBtn = Array.from(buttons).find((b) => b.textContent?.includes('Útil'))
    expect(thumbsUpBtn).toBeDefined()

    await React.act(async () => {
      thumbsUpBtn?.click()
    })

    expect(backendClient.submitUserFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: 'facebook/react',
        rating: 'positive',
        provider: 'cfAi',
      })
    )

    // Verify expanded form appears
    expect(container.textContent).toContain('¿Qué aspecto destacó más?')
    expect(container.querySelector('input[type="text"]')).not.toBeNull()
  })

  it('submitting detailed feedback updates to thank you message', async () => {
    const onSubmitted = vi.fn()
    const root = createRoot(container)
    await React.act(async () => {
      root.render(
        <UserFeedbackWidget
          repo="facebook/react"
          locale="es"
          onFeedbackSubmitted={onSubmitted}
        />
      )
    })

    const buttons = container.querySelectorAll('button')
    const thumbsUpBtn = Array.from(buttons).find((b) => b.textContent?.includes('Útil'))

    await React.act(async () => {
      thumbsUpBtn?.click()
    })

    const input = container.querySelector('input[type="text"]') as HTMLInputElement
    if (input) {
      await React.act(async () => {
        input.value = 'Excelente resumen!'
      })
    }

    const form = container.querySelector('form')
    await React.act(async () => {
      form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    })

    expect(backendClient.submitUserFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: 'facebook/react',
        rating: 'positive',
      })
    )
    expect(onSubmitted).toHaveBeenCalledWith('fb_123')
    expect(container.textContent).toContain('¡Gracias por tu valoración!')
  })

  it('renders contextual question for repo_explanation location', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(
        <UserFeedbackWidget
          repo="facebook/react"
          locale="es"
          location="repo_explanation"
        />
      )
    })

    expect(container.textContent).toContain('¿Fue clara y precisa la explicación del repo?')
  })

  it('hides widget when location is disabled in remote config', async () => {
    vi.mocked(backendClient.fetchRemoteConfig).mockResolvedValueOnce({
      freeDailyLimit: 15,
      proDailyLimit: 250,
      featureFlags: { enableMascot: true, enableDiagrams: true, maintenanceMode: false },
      feedbackLocations: {
        repo_explanation: false,
        architecture: true,
        file_explainer: true,
        mascot: true,
        overview: true,
      },
    })

    const root = createRoot(container)
    await React.act(async () => {
      root.render(
        <UserFeedbackWidget
          repo="facebook/react"
          locale="es"
          location="repo_explanation"
        />
      )
    })

    // Container should be empty because widget returned null
    expect(container.innerHTML).toBe('')
  })
})
