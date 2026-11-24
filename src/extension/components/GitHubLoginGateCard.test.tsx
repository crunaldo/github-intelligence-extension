// @vitest-environment happy-dom
import React, { act } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { GitHubLoginGateCard } from './GitHubLoginGateCard'
import * as supabaseAuth from '../auth/supabaseAuth'

vi.mock('../auth/supabaseAuth', () => ({
  signInWithGitHub: vi.fn(),
  getAuthSession: vi.fn().mockResolvedValue(null),
  subscribeToAuthSession: vi.fn().mockImplementation(() => () => {}),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('GitHubLoginGateCard', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    vi.mocked(supabaseAuth.getAuthSession).mockResolvedValue(null)
  })

  it('renders guest trial completed badge, title and benefits in Spanish without 5000 queries copy', async () => {
    const root = createRoot(container)
    await act(async () => {
      root.render(<GitHubLoginGateCard locale="es" repoName="owner/test-repo" />)
    })

    expect(container.textContent).toContain('MODO INVITADO COMPLETADO')
    expect(container.textContent).toContain('Conecta tu cuenta de GitHub para continuar')
    expect(container.textContent).toContain('owner/test-repo')
    expect(container.textContent).toContain('Análisis continuo y sin interrupciones')
    expect(container.textContent).toContain('Iniciar sesión con GitHub (1 clic)')
    expect(container.textContent).not.toContain('5,000')
  })

  it('renders in English when locale is en without 5000 queries copy', async () => {
    const root = createRoot(container)
    await act(async () => {
      root.render(<GitHubLoginGateCard locale="en" repoName="owner/test-repo" />)
    })

    expect(container.textContent).toContain('GUEST TRIAL COMPLETED')
    expect(container.textContent).toContain('Connect your GitHub account to continue')
    expect(container.textContent).toContain('Uninterrupted and continuous analysis')
    expect(container.textContent).toContain('Sign in with GitHub (1 click)')
    expect(container.textContent).not.toContain('5,000')
  })

  it('calls onLoggedIn callback when sign-in completes successfully', async () => {
    const mockSession: supabaseAuth.AuthSession = {
      accessToken: 'jwt-123',
      providerToken: 'gho_oauth_token',
      user: { id: 'u1', userName: 'octocat' },
      isPro: false,
    }
    vi.mocked(supabaseAuth.signInWithGitHub).mockResolvedValueOnce(mockSession)

    const onLoggedIn = vi.fn()
    const root = createRoot(container)
    await act(async () => {
      root.render(<GitHubLoginGateCard locale="es" onLoggedIn={onLoggedIn} />)
    })

    const button = container.querySelector('button.btn-primary') as HTMLButtonElement
    expect(button).toBeTruthy()

    await act(async () => {
      button.click()
    })

    expect(onLoggedIn).toHaveBeenCalledWith(mockSession)
  })

  it('displays cancellation notice if user dismisses OAuth', async () => {
    vi.mocked(supabaseAuth.signInWithGitHub).mockResolvedValueOnce(null)

    const root = createRoot(container)
    await act(async () => {
      root.render(<GitHubLoginGateCard locale="es" />)
    })

    const button = container.querySelector('button.btn-primary') as HTMLButtonElement
    expect(button).toBeTruthy()

    await act(async () => {
      button.click()
    })

    expect(container.textContent).toContain('cancelado o no se completó')
  })

  it('triggers onLoggedIn immediately when auth subscriber fires with authenticated session', async () => {
    let capturedSubscriber: ((session: supabaseAuth.AuthSession | null) => void) | null = null
    vi.mocked(supabaseAuth.subscribeToAuthSession).mockImplementationOnce((callback) => {
      capturedSubscriber = callback
      return () => {}
    })

    const onLoggedIn = vi.fn()
    const root = createRoot(container)
    await act(async () => {
      root.render(<GitHubLoginGateCard locale="es" onLoggedIn={onLoggedIn} />)
    })

    const incomingSession: supabaseAuth.AuthSession = {
      accessToken: 'jwt-immediate',
      user: { id: 'usr-auto-detected', userName: 'instant_dev' },
      isPro: false,
    }

    await act(async () => {
      capturedSubscriber?.(incomingSession)
    })

    expect(onLoggedIn).toHaveBeenCalledWith(incomingSession)
  })
})
