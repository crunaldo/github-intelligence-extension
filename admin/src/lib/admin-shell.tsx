'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  Database,
  ExternalLink,
  Flame,
  GitBranch,
  KeyRound,
  Lock,
  LogOut,
  Menu,
  Radio,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  User,
  Users,
  X,
  Zap
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

export type AdminRoute =
  | '/'
  | '/apis'
  | '/modules'
  | '/flags'
  | '/prompts'
  | '/users'
  | '/cache'
  | '/settings'

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

interface NavGroup {
  label: string
  items: {
    href: AdminRoute
    label: string
    icon: React.ComponentType<{ className?: string }>
    badge?: string
  }[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Panel & Inteligencia',
    items: [
      { href: '/', label: 'Live Telemetry & AI', icon: Activity, badge: 'Live' },
      { href: '/prompts', label: 'Prompts & Mascota', icon: Sparkles }
    ]
  },
  {
    label: 'Modelos & Acceso',
    items: [
      { href: '/apis', label: 'API Keys Multi-Pool', icon: KeyRound, badge: 'Pool' },
      { href: '/modules', label: 'Módulos Free vs Pro', icon: Boxes },
      { href: '/users', label: 'Usuarios & Membresías', icon: Users }
    ]
  },
  {
    label: 'Sistema & Infraestructura',
    items: [
      { href: '/flags', label: 'Cuotas & Feature Flags', icon: Sliders },
      { href: '/cache', label: 'Explorador de Caché KV', icon: Database },
      { href: '/settings', label: 'Configuración Avanzada', icon: Settings }
    ]
  }
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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

      const hashSession = parseSessionFromUrlHash()
      if (hashSession) {
        storeAdminSession(hashSession)
        const client = createBrowserSupabaseClient(hashSession.accessToken)
        const isAdmin = await verifyAdminRole(hashSession.userId, client)
        if (!active) return
        setSession(hashSession)
        setAuthStatus(isAdmin ? 'authorized' : 'forbidden')
        window.history.replaceState(null, '', window.location.pathname)
        return
      }

      const oauthCode = parseOAuthCallbackFromUrl()
      if (oauthCode) {
        const pkceSession = await exchangeAdminPkceCode(oauthCode)
        if (pkceSession) {
          storeAdminSession(pkceSession)
          const client = createBrowserSupabaseClient(pkceSession.accessToken)
          const isAdmin = await verifyAdminRole(pkceSession.userId, client)
          if (!active) return
          setSession(pkceSession)
          setAuthStatus(isAdmin ? 'authorized' : 'forbidden')
          window.history.replaceState(null, '', window.location.pathname)
          return
        }
      }

      const stored = getStoredAdminSession()
      if (!stored) {
        if (!active) return
        setAuthStatus('unauthenticated')
        return
      }

      const user = await fetchAuthUser(stored.accessToken)
      if (!user) {
        storeAdminSession(null)
        if (!active) return
        setAuthStatus('unauthenticated')
        return
      }

      const client = createBrowserSupabaseClient(stored.accessToken)
      const isAdmin = await verifyAdminRole(stored.userId, client)
      if (!active) return
      setSession(stored)
      setAuthStatus(isAdmin ? 'authorized' : 'forbidden')
    }

    resolveSession().catch((err) => {
      if (!active) return
      setAuthError(err instanceof Error ? err.message : String(err))
      setAuthStatus('unauthenticated')
    })

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

  // ---------------------------------------------------------------------------
  // Pantalla de Verificación de Privilegios (Loading)
  // ---------------------------------------------------------------------------
  if (authStatus === 'checking') {
    return (
      <div className="relative min-h-screen bg-[#090d16] text-slate-100 flex flex-col items-center justify-center p-6 overflow-hidden">
        {/* Dot pattern */}
        <div className="pointer-events-none absolute inset-0 text-slate-700/30 bg-dot-pattern [mask-image:radial-gradient(600px_circle_at_center,white,transparent)]" />
        
        <div className="relative z-10 flex flex-col items-center gap-4 text-center hero-in">
          <div className="relative flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-600 p-0.5 shadow-xl shadow-indigo-500/20">
            <div className="flex size-full items-center justify-center rounded-2xl bg-[#090d16]">
              <Sparkles className="size-6 text-indigo-400 animate-pulse" />
            </div>
          </div>
          <div>
            <h2 className="text-base font-semibold text-white tracking-tight">GitHub Intelligence Admin</h2>
            <p className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Verificando credenciales y rol de administrador...
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Pantalla de Inicio de Sesión (Inspirada en Nexora Auth)
  // ---------------------------------------------------------------------------
  if (authStatus === 'unauthenticated') {
    return (
      <div className="relative min-h-screen bg-[#090d16] text-slate-100 flex flex-col justify-between overflow-hidden">
        {/* Dot pattern */}
        <div className="pointer-events-none absolute inset-0 text-slate-600/30 bg-dot-pattern [mask-image:radial-gradient(750px_circle_at_center,white,transparent)]" />

        {/* Header */}
        <header className="relative z-20 flex h-20 items-center justify-between px-6 lg:px-12 border-b border-white/5 bg-[#090d16]/70 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25">
              <Sparkles className="size-5" />
            </div>
            <div>
              <span className="font-semibold text-white tracking-tight text-sm">GitHub Intelligence</span>
              <span className="ml-2 text-xs text-indigo-400 font-mono font-medium">Console v2.0</span>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Cloudflare Edge Live
          </div>
        </header>

        {/* Main Split Layout */}
        <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-12">
          <div className="grid w-full max-w-5xl items-center gap-12 lg:grid-cols-[1fr_420px] lg:gap-16">
            
            {/* Left Hero Section */}
            <div className="hidden lg:block space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-sm">
                <span className="size-1.5 rounded-full bg-indigo-400" />
                Seguridad de Nivel Empresarial • Supabase RBAC
              </div>

              <h1 className="text-4xl font-bold tracking-tight text-white xl:text-5xl leading-tight">
                Control de Misión para <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Inteligencia de Repositorios</span>
              </h1>

              <p className="text-sm text-slate-400 leading-relaxed max-w-lg">
                Gestiona telemetría en tiempo real, balanceo inteligente de claves IA (Gemini, Groq, Llama, DeepSeek), monetización y cuotas Free vs Pro desde un único panel centralizado.
              </p>

              <div className="space-y-3 pt-2">
                {[
                  'Sincronización dual instantánea: Cloudflare KV & Supabase',
                  'Rotación inteligente de API keys por prioridad o Round-Robin',
                  'Telemetría en vivo: latencias P50/P95, cache-hit y volumen diario'
                ].map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 text-xs text-slate-300">
                    <div className="flex size-4 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-400">
                      <Check className="size-2.5" />
                    </div>
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Auth Card */}
            <div className="w-full rounded-2xl border border-white/10 bg-[#0f172a]/80 backdrop-blur-xl p-8 shadow-2xl space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Acceso de Administrador</h2>
                <p className="text-xs text-slate-400 mt-1">Identifícate con tu cuenta autorizada para acceder al panel.</p>
              </div>

              {authError && (
                <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 hero-in">
                  <AlertTriangle className="size-4 shrink-0 text-rose-400 mt-0.5" />
                  <span className="flex-1">{authError}</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleGitHubOAuthSignIn()}
                className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-slate-800 hover:bg-slate-700/90 border border-white/10 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition active:scale-[0.99]"
              >
                <GitBranch className="size-4 text-indigo-400" />
                Continuar con GitHub OAuth
              </button>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-white/10" />
                <span className="mx-3 text-[11px] uppercase tracking-wider text-slate-500 font-mono">o con email</span>
                <div className="flex-grow border-t border-white/10" />
              </div>

              <form onSubmit={handleEmailSignIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Email de Administrador</label>
                  <input
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="admin@github-intelligence.com"
                    className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Contraseña</label>
                  <input
                    type="password"
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-600/25 transition active:scale-[0.99]"
                >
                  {submitting ? 'Autenticando...' : 'Iniciar Sesión en el Panel'}
                </button>
              </form>

              <p className="text-[11px] text-slate-500 text-center">
                Acceso restringido a cuentas con rol <code className="text-indigo-400">admin</code> en Supabase.
              </p>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="relative z-20 flex h-14 items-center justify-between px-6 lg:px-12 border-t border-white/5 text-xs text-slate-500">
          <span>GitHub Intelligence Platform &copy; {new Date().getFullYear()}</span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Shield className="size-3.5 text-indigo-400" />
              Cloudflare Pages &amp; Edge Workers
            </span>
          </div>
        </footer>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Pantalla de Acceso Denegado (403 Forbidden)
  // ---------------------------------------------------------------------------
  if (authStatus === 'forbidden' || !session) {
    return (
      <div className="relative min-h-screen bg-[#090d16] text-slate-100 flex items-center justify-center p-6 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 text-slate-700/30 bg-dot-pattern [mask-image:radial-gradient(600px_circle_at_center,white,transparent)]" />
        
        <div className="relative z-10 w-full max-w-md rounded-2xl border border-rose-500/30 bg-[#0f172a]/90 backdrop-blur-xl p-6 shadow-2xl space-y-5 hero-in">
          <div className="flex items-center gap-3 text-rose-400">
            <div className="flex size-10 items-center justify-center rounded-xl bg-rose-500/10 border border-rose-500/20">
              <ShieldAlert className="size-6 text-rose-400" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-white">403 — Acceso Denegado</h1>
              <p className="text-xs text-rose-300">Rol de administrador no encontrado</p>
            </div>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Has iniciado sesión como <span className="font-mono text-white">{session?.email || session?.userId}</span>, pero este perfil no tiene el rol <code className="text-rose-400">admin</code> asignado en la base de datos Supabase.
          </p>

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-800 hover:bg-slate-700 px-4 py-2.5 text-xs font-medium text-white transition"
          >
            <LogOut className="size-4" />
            Cerrar Sesión e Intentar con Otra Cuenta
          </button>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Layout Principal Autorizado (Inspirado en AppSidebar y AppHeader de Nexora)
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col lg:flex-row antialiased">
      
      {/* Sidebar Desktop & Mobile Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-white/10 bg-[#0b1120]/95 backdrop-blur-xl flex flex-col justify-between transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full overflow-hidden">
          
          {/* Sidebar Header / Brand Switcher */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <a href="/" className="flex items-center gap-3 group">
              <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25 group-hover:scale-105 transition-transform">
                <Sparkles className="size-5" />
              </div>
              <div className="grid text-left leading-tight">
                <span className="font-bold text-white text-sm tracking-tight truncate">
                  GitHub Intelligence
                </span>
                <span className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Admin Console v2.0
                </span>
              </div>
            </a>

            {/* Mobile close button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              aria-label="Cerrar menú"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Sidebar Navigation (Categorized) */}
          <div className="flex-1 overflow-y-auto p-3 space-y-6">
            {NAV_GROUPS.map((group, groupIdx) => (
              <div key={groupIdx} className="space-y-1">
                <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const isActive = item.href === activeRoute
                    return (
                      <a
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`group flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                          isActive
                            ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-sm'
                            : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon className={`size-4 shrink-0 transition-colors ${isActive ? 'text-indigo-400' : 'text-slate-400 group-hover:text-white'}`} />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                            isActive
                              ? 'bg-indigo-500/30 text-indigo-200'
                              : 'bg-white/5 text-slate-400 group-hover:text-slate-300'
                          }`}>
                            {item.badge}
                          </span>
                        )}
                      </a>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Sidebar Footer (NavUser) */}
          <div className="p-3 border-t border-white/10 bg-[#090d16]/60">
            <div className="flex items-center justify-between gap-2 rounded-xl p-2 bg-white/5 border border-white/5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300 font-semibold text-xs border border-indigo-500/30">
                  {session.email?.slice(0, 2).toUpperCase() || 'AD'}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-white truncate">
                    {session.email || 'Admin Principal'}
                  </div>
                  <div className="text-[10px] text-emerald-400 font-mono">
                    Super Admin
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                title="Cerrar Sesión"
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Backdrop for mobile */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Top AppHeader */}
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-[#090d16]/80 backdrop-blur-md px-4 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:text-white"
              aria-label="Abrir navegación"
            >
              <Menu className="size-4" />
            </button>

            {/* Breadcrumb Path */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="hover:text-slate-200 transition">Consola</span>
              <ChevronRight className="size-3 text-slate-600" />
              <span className="font-semibold text-white truncate">{title}</span>
            </div>
          </div>

          {/* Header Right Actions */}
          <div className="flex items-center gap-2.5">
            <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              KV Sincronizado
            </div>

            <a
              href="https://github-intelligence-api.crunaldo2.workers.dev/v1/config"
              target="_blank"
              rel="noreferrer"
              className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-1 text-xs text-slate-300 hover:text-white transition"
              title="Inspeccionar respuesta de Worker Edge en vivo"
            >
              <span>Worker Edge</span>
              <ExternalLink className="size-3 text-slate-400" />
            </a>
          </div>
        </header>

        {/* Page Content Body */}
        <main className="flex-1 p-4 lg:p-8 max-w-7xl w-full mx-auto space-y-6 overflow-y-auto">
          {/* Header Title Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-white/10 pb-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
              <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
            </div>
          </div>

          {children({ client: activeClient, session })}
        </main>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Componente KpiCard Mejorado (Inspirado en DashboardKpi de Nexora)
// -----------------------------------------------------------------------------
export function KpiCard({
  label,
  value,
  hint,
  accent = 'indigo',
  icon,
  badge,
  trend,
  sparkline
}: {
  label: string
  value: string | number
  hint?: string
  accent?: 'indigo' | 'emerald' | 'amber' | 'sky' | 'purple' | 'rose'
  icon?: React.ReactNode
  badge?: string
  trend?: string
  sparkline?: number[]
}) {
  const accentConfig = {
    indigo: {
      border: 'border-indigo-500/20 hover:border-indigo-500/40',
      iconBg: 'bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-600 text-white',
      badgeBg: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
      sparkColor: '#6366f1'
    },
    emerald: {
      border: 'border-emerald-500/20 hover:border-emerald-500/40',
      iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white',
      badgeBg: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
      sparkColor: '#10b981'
    },
    amber: {
      border: 'border-amber-500/20 hover:border-amber-500/40',
      iconBg: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white',
      badgeBg: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
      sparkColor: '#f59e0b'
    },
    sky: {
      border: 'border-sky-500/20 hover:border-sky-500/40',
      iconBg: 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white',
      badgeBg: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
      sparkColor: '#0ea5e9'
    },
    purple: {
      border: 'border-purple-500/20 hover:border-purple-500/40',
      iconBg: 'bg-gradient-to-br from-purple-500 to-violet-600 text-white',
      badgeBg: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
      sparkColor: '#a855f7'
    },
    rose: {
      border: 'border-rose-500/20 hover:border-rose-500/40',
      iconBg: 'bg-gradient-to-br from-rose-500 to-red-600 text-white',
      badgeBg: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
      sparkColor: '#f43f5e'
    }
  }[accent]

  // Default simulated sparkline data if not provided
  const points = sparkline && sparkline.length >= 2 ? sparkline : [10, 14, 12, 18, 16, 22, 25, 24, 28, 30]
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const coords = points.map((p, idx) => {
    const x = (idx / (points.length - 1)) * 100
    const y = 20 - ((p - min) / range) * 16
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const pathD = `M ${coords.join(' L ')}`
  const areaD = `${pathD} L 100,24 L 0,24 Z`

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${accentConfig.border} bg-[#0f172a]/80 backdrop-blur-md p-5 shadow-sm transition-all bg-dot-pattern-dense`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        {icon && (
          <div className="flex size-9 items-center justify-center rounded-xl p-0.5 border border-white/10 shadow-sm">
            <div className={`flex size-full items-center justify-center rounded-[10px] ${accentConfig.iconBg}`}>
              {icon}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div className="text-2xl font-bold tracking-tight text-white">{value}</div>
        {(badge || trend) && (
          <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${accentConfig.badgeBg}`}>
            {badge || trend}
          </span>
        )}
      </div>

      {hint && (
        <div className="mt-1 text-xs text-slate-400 truncate">
          {hint}
        </div>
      )}

      {/* Mini SVG Sparkline */}
      <div className="mt-3 h-6 w-full opacity-60">
        <svg className="h-full w-full overflow-visible" viewBox="0 0 100 24" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`grad-${accent}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accentConfig.sparkColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={accentConfig.sparkColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <path d={areaD} fill={`url(#grad-${accent})`} />
          <path d={pathD} fill="none" stroke={accentConfig.sparkColor} strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Componente SectionCard Mejorado
// -----------------------------------------------------------------------------
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
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0f172a]/75 backdrop-blur-md p-5 sm:p-6 shadow-sm hover:border-white/15 transition-all space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/5 pb-3">
        <div>
          <h2 className="text-base font-semibold text-white tracking-tight">{title}</h2>
          {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div>{children}</div>
    </section>
  )
}

// -----------------------------------------------------------------------------
// Componente StatusBanner Mejorado
// -----------------------------------------------------------------------------
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
      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs sm:text-sm shadow-md hero-in ${
        isSuccess
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
          : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
      }`}
    >
      <div className="flex items-center gap-2.5">
        {isSuccess ? (
          <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
        ) : (
          <AlertTriangle className="size-4 text-rose-400 shrink-0" />
        )}
        <span className="font-medium leading-relaxed">{status.message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
          aria-label="Cerrar notificación"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
