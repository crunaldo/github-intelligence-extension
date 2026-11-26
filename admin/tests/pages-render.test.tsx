// @vitest-environment happy-dom
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import ReleasesPage from '../src/app/releases/page'
import CostsPage from '../src/app/costs/page'
import TrendsPage from '../src/app/trends/page'
import NotificationsPage from '../src/app/notifications/page'
import TeamPage from '../src/app/team/page'
import ExportPage from '../src/app/export/page'
import { type AdminSession } from '../src/lib/supabase-client'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockStorage: Record<string, string> = {}
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn((key: string) => mockStorage[key] ?? null),
    setItem: vi.fn((key: string, val: string) => {
      mockStorage[key] = val
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStorage[key]
    }),
    clear: vi.fn(() => {
      Object.keys(mockStorage).forEach((k) => delete mockStorage[k])
    })
  },
  writable: true
})

const fakeSession: AdminSession = {
  accessToken: 'fake-token',
  userId: 'user-admin-1',
  email: 'admin@example.com'
}

const fakeClient: any = {
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { role: 'admin' }, error: null }),
        limit: () => Promise.resolve({ data: [{ role: 'admin' }], error: null }),
        then: (cb: any) => Promise.resolve({ data: [{ role: 'admin' }], error: null }).then(cb)
      }),
      order: () => ({
        limit: () => Promise.resolve({ data: [], error: null })
      })
    })
  })
}

describe('Admin Pages Render', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  it('renders ReleasesPage without injected session (checking/unauthenticated)', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(<ReleasesPage />)
    })
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  it('renders ReleasesPage with injectedSession', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(<ReleasesPage injectedSession={fakeSession} injectedClient={fakeClient} />)
    })
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  it('renders CostsPage with injectedSession', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(<CostsPage injectedSession={fakeSession} injectedClient={fakeClient} />)
    })
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  it('renders TrendsPage with injectedSession', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(<TrendsPage injectedSession={fakeSession} injectedClient={fakeClient} />)
    })
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  it('renders NotificationsPage with injectedSession', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(<NotificationsPage injectedSession={fakeSession} injectedClient={fakeClient} />)
    })
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  it('renders TeamPage with injectedSession', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(<TeamPage injectedSession={fakeSession} injectedClient={fakeClient} />)
    })
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  it('renders ExportPage with injectedSession', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(<ExportPage injectedSession={fakeSession} injectedClient={fakeClient} />)
    })
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })
})
