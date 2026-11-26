import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import AdminDashboardPage from './app/page'
import TelemetryPage from './app/telemetry/page'
import ApisManagementPage from './app/apis/page'
import AnalysisModulesPage from './app/modules/page'
import PromptsStudioPage from './app/prompts/page'
import FeatureFlagsPage from './app/flags/page'
import UsersManagementPage from './app/users/page'
import CacheExplorerPage from './app/cache/page'
import SettingsPage from './app/settings/page'
import PlaygroundPage from './app/playground/page'
import AccessControlPage from './app/access/page'
import AuditLogPage from './app/audit/page'
import CampaignsPage from './app/campaigns/page'
import BillingPage from './app/billing/page'

function normalizePath(pathname: string): string {
  const cleaned = pathname.replace(/\/+$/, '')
  return cleaned === '' ? '/' : cleaned
}

function AdminAppRouter() {
  const [pathname, setPathname] = useState<string>(() =>
    typeof window !== 'undefined' ? normalizePath(window.location.pathname) : '/'
  )

  useEffect(() => {
    const onPopState = () => {
      setPathname(normalizePath(window.location.pathname))
    }

    const onDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      const target = (event.target as HTMLElement | null)?.closest?.('a[href]') as
        | HTMLAnchorElement
        | null
      if (!target || target.target === '_blank') return
      const href = target.getAttribute('href')
      if (!href || !href.startsWith('/')) return
      event.preventDefault()
      const nextUrl = new URL(href, window.location.origin)
      if (normalizePath(nextUrl.pathname) !== normalizePath(window.location.pathname)) {
        window.history.pushState(null, '', nextUrl.pathname + nextUrl.search + nextUrl.hash)
        setPathname(normalizePath(nextUrl.pathname))
      }
    }

    window.addEventListener('popstate', onPopState)
    document.addEventListener('click', onDocumentClick)
    return () => {
      window.removeEventListener('popstate', onPopState)
      document.removeEventListener('click', onDocumentClick)
    }
  }, [])

  switch (pathname) {
    case '/telemetry':
      return <TelemetryPage />
    case '/playground':
      return <PlaygroundPage />
    case '/apis':
      return <ApisManagementPage />
    case '/modules':
      return <AnalysisModulesPage />
    case '/access':
      return <AccessControlPage />
    case '/prompts':
      return <PromptsStudioPage />
    case '/flags':
      return <FeatureFlagsPage />
    case '/campaigns':
      return <CampaignsPage />
    case '/billing':
      return <BillingPage />
    case '/audit':
      return <AuditLogPage />
    case '/users':
      return <UsersManagementPage />
    case '/cache':
      return <CacheExplorerPage />
    case '/settings':
      return <SettingsPage />
    case '/':
    default:
      return <AdminDashboardPage />
  }
}

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <AdminAppRouter />
    </React.StrictMode>
  )
}
