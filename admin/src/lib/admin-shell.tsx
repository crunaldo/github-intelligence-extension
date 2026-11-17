'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  GitBranch,
  Lock,
  LogOut,
  ShieldCheck,
  Sliders,
  Sparkles,
  Users,
  X
} from 'lucide-react'
import { verifyAdminRole } from './kv-sync'
import {
  type AdminSession,
  type AdminSupabaseClient,
  createBrowserSupabaseClient,
  exchangeAdminPkceCode,
  fetchAuthUser,
  getStoredAdminSession,
  parseOAuthCallbackFromUrl,
  parseSessionFromUrlHash,
  signInWithEmailPassword,
  startGitHubOAuthSignIn,
  storeAdminSession
} from './supabase-client'

export type AdminRoute = '/' | '/prompts' | '/flags' | '/users' | '/cache'

export interface AdminShellRenderContext {
  client: AdminSupabaseClient
  session: AdminSession
}

export interface AdminShellProps {
  activeRoute: AdminRoute
  title: string
  subtitle: string
  children: (ctx: AdminShellRenderContext) => React.ReactNode
  injectedClient?: AdminSupabaseClient
  injectedSession?: AdminSession
}

interface NavItem {
  href: AdminRoute
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Telemetry & Providers', icon: Activity },
  { href: '/prompts', label: 'Prompts & Mascot', icon: Sparkles },
  { href: '/flags', label: 'Flags & Quotas', icon: Sliders },
  { href: '/users', label: 'Users & Billing', icon: Users },
  { href: '/cache', label: 'Cache Explorer', icon: Database }
]

export function AdminShell({
  activeRoute,
  title,
  subtitle,
  children,
  injectedClient,
  injectedSession
}: AdminShellProps) {
  const [session, setSession] = useState<AdminSession | null>(injectedSession ?? null)
  const [authStatus, setAuthStatus] = useState<'checking' | 'unauthenticated' | 'forbidden' | 'authorized'>(
    'checking'
  )
  const [emailInput, setEmailInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true

    async function resolveSession() {
      if (injectedSession) {
        const client = injectedClient ?? createBrowserSupabaseClient(injectedSession.accessToken)
        const isAdmin = await verifyAdminRole(injectedSession.userId, client)
        if (!active) return
        setSession(injectedSession)
        setAuthStatus(isAdmin ? 'authorized' : 'forbidden')
        return
      }

      const callback = parseOAuthCallbackFromUrl()
      if (callback.error) {
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', window.location.pathname)
        }
        if (!active) return
        setAuthError(callback.error)
        setSession(null)
        setAuthStatus('unauthenticated')
        return
      }

      if (callback.code) {
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', window.location.pathname)
        }
        const pkceResult = await exchangeAdminPkceCode(callback.code)
        if (!active) return
        if (!pkceResult.session) {
          storeAdminSession(null)
          setSession(null)
          setAuthError(pkceResult.error ?? 'GitHub OAuth code exchange failed')
          setAuthStatus('unauthenticated')
          return
        }

        const client = injectedClient ?? createBrowserSupabaseClient(pkceResult.session.accessToken)
        const isAdmin = await verifyAdminRole(pkceResult.session.userId, client)
        if (!active) return
        setSession(pkceResult.session)
        setAuthStatus(isAdmin ? 'authorized' : 'forbidden')
        return
      }

      const hashSession = parseSessionFromUrlHash()
      const stored = hashSession ?? getStoredAdminSession()
      if (!stored) {
        if (!active) return
        setAuthStatus('unauthenticated')
        return
      }

      const user = await fetchAuthUser(stored.accessToken)
      if (!user) {
        storeAdminSession(null)
        if (!active) return
        setSession(null)
        if (hashSession) {
          setAuthError('Unable to verify GitHub OAuth session. Please sign in again.')
        }
        setAuthStatus('unauthenticated')
        return
      }

      const resolved: AdminSession = {
        accessToken: stored.accessToken,
        userId: user.id,
        email: user.email
      }
      storeAdminSession(resolved)
      if (typeof window !== 'undefined' && window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }

      const client = injectedClient ?? createBrowserSupabaseClient(resolved.accessToken)
      const isAdmin = await verifyAdminRole(resolved.userId, client)
      if (!active) return
      setSession(resolved)
      setAuthStatus(isAdmin ? 'authorized' : 'forbidden')
    }

    void resolveSession()
    return () => {
      active = false
    }
  }, [injectedClient, injectedSession])

  const activeClient = useMemo(() => {
    if (injectedClient) return injectedClient
    return createBrowserSupabaseClient(session?.accessToken)
  }, [injectedClient, session?.accessToken])

  async function handleEmailSignIn(event: React.FormEvent) {
    event.preventDefault()
    setAuthError(null)
    setSubmitting(true)
    const result = await signInWithEmailPassword(emailInput.trim(), passwordInput)
    setSubmitting(false)

    if (!result.session) {
      setAuthError(result.error ?? 'Authentication failed')
      return
    }

    const client = injectedClient ?? createBrowserSupabaseClient(result.session.accessToken)
    const isAdmin = await verifyAdminRole(result.session.userId, client)
    setSession(result.session)
    setAuthStatus(isAdmin ? 'authorized' : 'forbidden')
  }

  async function handleGitHubOAuthSignIn() {
    setAuthError(null)
    const result = await startGitHubOAuthSignIn()
    if (!result.ok) {
      setAuthError(result.error ?? 'Unable to start GitHub OAuth sign-in')
    }
  }

  function handleSignOut() {
    storeAdminSession(null)
    setSession(null)
    setAuthStatus('unauthenticated')
  }

  if (authStatus === 'checking') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-6 py-5 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-indigo-400 animate-pulse" />
          <span className="text-sm text-slate-300">Verifying admin privileges...</span>
        </div>
      </div>
    )
  }

  if (authStatus === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
              <Lock className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">GitHub Intelligence Admin</h1>
              <p className="text-xs text-slate-400">Restricted to profiles with role = admin</p>
            </div>
          </div>

          {authError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {authError}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleGitHubOAuthSignIn()}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2.5 text-sm font-medium text-white transition"
          >
            <GitBranch className="w-4 h-4" />
            Continue with GitHub
          </button>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-slate-800" />
            <span className="mx-3 text-[11px] uppercase tracking-wider text-slate-500">or email</span>
            <div className="flex-grow border-t border-slate-800" />
          </div>

          <form onSubmit={handleEmailSignIn} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Admin Email</label>
              <input
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="admin@domain.com"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
              <input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white transition"
            >
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (authStatus === 'forbidden' || !session) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-900 p-6 space-y-4">
          <div className="flex items-center gap-3 text-rose-400">
            <AlertTriangle className="w-6 h-6" />
            <h1 className="text-lg font-semibold">403 — Admin Access Required</h1>
          </div>
          <p className="text-sm text-slate-300">
            Signed in as <span className="font-mono text-white">{session?.email || session?.userId}</span>,
            but this account does not have <code className="text-rose-300">profiles.role = 'admin'</code>.
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm text-white"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col lg:flex-row">
      <aside className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-900/70 p-4 flex flex-col justify-between">
        <div className="space-y-6">
          <div className="flex items-center gap-2.5 px-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">GPI Control Panel</div>
              <div className="text-[11px] text-slate-400">Cloudflare Pages Admin</div>
            </div>
          </div>

          <nav className="flex lg:flex-col gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const isActive = item.href === activeRoute
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
                    isActive
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/70 border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </a>
              )
            })}
          </nav>
        </div>

        <div className="hidden lg:flex items-center justify-between border-t border-slate-800 pt-4 mt-6 px-2">
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-200 truncate">
              {session.email || 'Admin User'}
            </div>
            <div className="text-[11px] text-emerald-400">role: admin</div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            title="Sign out"
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800/80 pb-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
            <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>
          </div>
        </header>

        {children({ client: activeClient, session })}
      </main>
    </div>
  )
}

export function KpiCard({
  label,
  value,
  hint,
  accent = 'indigo',
  icon
}: {
  label: string
  value: string | number
  hint?: string
  accent?: 'indigo' | 'emerald' | 'amber' | 'sky'
  icon?: React.ReactNode
}) {
  const accentRing = {
    indigo: 'border-indigo-500/20',
    emerald: 'border-emerald-500/20',
    amber: 'border-amber-500/20',
    sky: 'border-sky-500/20'
  }[accent]

  return (
    <div className={`rounded-xl border ${accentRing} bg-slate-900/70 p-4 shadow-sm`}>
      <div className="flex items-center justify-between text-xs font-medium text-slate-400">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-semibold text-white tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  )
}

export function SectionCard({
  title,
  description,
  actions,
  children
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function StatusBanner({
  status,
  onDismiss
}: {
  status: { type: 'success' | 'error'; message: string } | null
  onDismiss?: () => void
}) {
  if (!status) return null
  const isSuccess = status.type === 'success'
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
        isSuccess
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
          : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
      }`}
    >
      <div className="flex items-center gap-2">
        {isSuccess ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
        )}
        <span>{status.message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-slate-400 hover:text-white p-1 rounded"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
