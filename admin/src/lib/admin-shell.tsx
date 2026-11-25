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
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Moon,
  Palette,
  Radio,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
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
  fetchAuthUser,
  getStoredAdminSession,
  resolveOAuthSessionFromUrl,
  signInWithEmailPassword,
  startGitHubOAuthSignIn,
  storeAdminSession
} from './supabase-client'

export interface LogoVariant {
  id: string
  label: string
  description: string
  src: string
}

export const LOGO_VARIANTS: LogoVariant[] = [
  { id: 'default', label: 'Oficial', description: 'Logo insignia coral', src: '/logo.svg' },
  { id: 'coding', label: 'Coding', description: 'Mascota programando', src: '/mascot/12_coding.svg' },
  { id: 'cool', label: 'Cool', description: 'Gafas de sol', src: '/mascot/06_cool.svg' },
  { id: 'investigating', label: 'Investigador', description: 'Auditoría y análisis', src: '/mascot/10_investigating.svg' },
  { id: 'wink', label: 'Guiño', description: 'Mascota amigable', src: '/mascot/03_wink.svg' },
  { id: 'happy', label: 'Feliz', description: 'Mascota alegre', src: '/mascot/02_happy.svg' },
  { id: 'success', label: 'Éxito', description: 'Verificación exitosa', src: '/mascot/22_success.svg' }
]

export type ThemeMode = 'dark' | 'light'

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined' || !window.localStorage) return 'dark'
  const stored = window.localStorage.getItem('gpi_admin_theme')
  return stored === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme: ThemeMode) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
    root.classList.remove('light')
  } else {
    root.classList.remove('dark')
    root.classList.add('light')
  }
}

export function getStoredLogoVariant(): string {
  if (typeof window === 'undefined' || !window.localStorage) return 'default'
  const stored = window.localStorage.getItem('gpi_admin_logo_variant')
  return stored && LOGO_VARIANTS.some((v) => v.id === stored) ? stored : 'default'
}

export function ThemeToggle({
  theme,
  onToggle,
  className = '',
  compact = false
}: {
  theme: ThemeMode
  onToggle: () => void
  className?: string
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition active:scale-95 ${
        theme === 'dark'
          ? 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-sm'
      } ${className}`}
    >
      {theme === 'dark' ? (
        <>
          <Sun className="size-3.5 text-amber-400" />
          {!compact && <span className="hidden sm:inline">Claro</span>}
        </>
      ) : (
        <>
          <Moon className="size-3.5 text-indigo-600" />
          {!compact && <span className="hidden sm:inline">Oscuro</span>}
        </>
      )}
    </button>
  )
}

export type AdminRoute =
  | '/'
  | '/telemetry'
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
    label: 'Panel Principal',
    items: [
      { href: '/', label: 'Dashboard General', icon: LayoutDashboard, badge: 'KPIs' },
      { href: '/telemetry', label: 'Telemetría en Vivo', icon: Activity, badge: 'Live' },
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
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const initial = getStoredTheme()
    applyTheme(initial)
    return initial
  })
  const [logoVariant, setLogoVariant] = useState<string>(() => getStoredLogoVariant())
  const [emailInput, setEmailInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const toggleTheme = () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('gpi_admin_theme', next)
    }
  }

  const selectLogoVariant = (id: string) => {
    setLogoVariant(id)
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('gpi_admin_logo_variant', id)
    }
  }

  const currentLogo = useMemo(() => {
    return LOGO_VARIANTS.find((v) => v.id === logoVariant) ?? LOGO_VARIANTS[0]
  }, [logoVariant])

  useEffect(() => {
    let active = true

    async function resolveSession() {
      if (injectedSession) {
        const client = injectedClient ?? createBrowserSupabaseClient(injectedSession.accessToken)
        const isAdmin = await verifyAdminRole(injectedSession.userId, client, injectedSession.email)
        if (!active) return
        setSession(injectedSession)
        setAuthStatus(isAdmin ? 'authorized' : 'forbidden')
        return
      }

      // Check if arriving from OAuth callback (hash #access_token=... or search ?code=...)
      const oauthResult = await resolveOAuthSessionFromUrl()
      if (oauthResult.error) {
        if (!active) return
        setAuthError(oauthResult.error)
        setAuthStatus('unauthenticated')
        if (typeof window !== 'undefined' && window.history?.replaceState) {
          window.history.replaceState(null, '', window.location.pathname)
        }
        return
      }

      if (oauthResult.session) {
        const client = createBrowserSupabaseClient(oauthResult.session.accessToken)
        const isAdmin = await verifyAdminRole(
          oauthResult.session.userId,
          client,
          oauthResult.session.email
        )
        if (!active) return
        setSession(oauthResult.session)
        setAuthStatus(isAdmin ? 'authorized' : 'forbidden')
        if (typeof window !== 'undefined' && window.history?.replaceState) {
          window.history.replaceState(null, '', window.location.pathname)
        }
        return
      }

      // Check stored session in localStorage
      const stored = getStoredAdminSession()
      if (!stored || !stored.accessToken) {
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

      const repairedSession: AdminSession = {
        accessToken: stored.accessToken,
        userId: user.id,
        email: user.email || stored.email || ''
      }
      if (stored.userId !== user.id || stored.email !== repairedSession.email) {
        storeAdminSession(repairedSession)
      }

      const client = createBrowserSupabaseClient(repairedSession.accessToken)
      const isAdmin = await verifyAdminRole(
        repairedSession.userId,
        client,
        repairedSession.email
      )
      if (!active) return
      setSession(repairedSession)
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
      setAuthError(result.error ?? 'Error de autenticación')
      return
    }

    const client = injectedClient ?? createBrowserSupabaseClient(result.session.accessToken)
    const isAdmin = await verifyAdminRole(result.session.userId, client, result.session.email)
    setSession(result.session)
    setAuthStatus(isAdmin ? 'authorized' : 'forbidden')
  }

  async function handleGitHubOAuthSignIn() {
    setAuthError(null)
    const result = await startGitHubOAuthSignIn()
    if (!result.ok) {
      setAuthError(result.error ?? 'No se pudo iniciar el flujo de GitHub OAuth')
    }
  }

  function handleSignOut() {
    storeAdminSession(null)
    setSession(null)
    setAuthStatus('unauthenticated')
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }

  // ---------------------------------------------------------------------------
  // Pantalla de Verificación de Privilegios (Loading)
  // ---------------------------------------------------------------------------
  if (authStatus === 'checking') {
    return (
      <div className="relative min-h-screen bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 flex flex-col justify-between overflow-hidden transition-colors duration-200">
        <div className="pointer-events-none absolute inset-0 bg-dot-pattern [mask-image:radial-gradient(600px_circle_at_center,white,transparent)]" />
        
        <header className="relative z-20 flex h-16 items-center justify-end px-6">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>

        <div className="relative z-10 flex flex-col items-center gap-4 text-center hero-in px-6">
          <div className="relative flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 dark:from-indigo-500/20 dark:to-purple-500/20 border border-slate-200 dark:border-white/10 p-2.5 shadow-xl">
            <img
              src={currentLogo.src}
              alt="Logo"
              className="size-full object-contain animate-pulse"
            />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white tracking-tight">
              GitHub Intelligence
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Verificando credenciales de administrador...
            </p>
          </div>
        </div>

        <footer className="relative z-20 flex h-14 items-center justify-center text-xs text-slate-400">
          GitHub Intelligence Admin
        </footer>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Pantalla de Inicio de Sesión (Limpia, Sin Bloques de Marketing)
  // ---------------------------------------------------------------------------
  if (authStatus === 'unauthenticated') {
    return (
      <div className="relative min-h-screen bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 flex flex-col justify-between overflow-hidden transition-colors duration-200">
        {/* Dot pattern */}
        <div className="pointer-events-none absolute inset-0 bg-dot-pattern [mask-image:radial-gradient(750px_circle_at_center,white,transparent)]" />

        {/* Minimal Header */}
        <header className="relative z-20 flex h-16 items-center justify-between px-6 lg:px-12 border-b border-slate-200 dark:border-white/5 bg-white/70 dark:bg-[#090d16]/70 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <img
              src={currentLogo.src}
              alt="Logo"
              className="size-8 rounded-xl object-contain shadow-sm"
            />
            <span className="font-semibold text-slate-900 dark:text-white tracking-tight text-sm">
              GitHub Intelligence
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-600 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Edge Online
            </div>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
        </header>

        {/* Centered Minimal Auth Card */}
        <main className="relative z-10 flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-[420px] rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f172a]/90 backdrop-blur-xl p-8 shadow-xl dark:shadow-2xl space-y-6 hero-in">
            
            {/* Header: Logo & Title */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="relative group">
                <div className="flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 dark:from-indigo-500/20 dark:to-purple-500/20 border border-slate-200 dark:border-white/10 p-2.5 shadow-md transition-transform group-hover:scale-105">
                  <img
                    src={currentLogo.src}
                    alt={currentLogo.label}
                    className="size-full object-contain drop-shadow"
                  />
                </div>
              </div>

              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                  GitHub Intelligence
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Panel de Administración
                </p>
              </div>

              {/* Versiones del Logo Selector */}
              <div className="pt-1 w-full">
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1.5 px-0.5">
                  <span className="font-mono text-[10px] uppercase tracking-wider">Versión del logo</span>
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">{currentLogo.label}</span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1">
                  {LOGO_VARIANTS.map((variant) => {
                    const isSelected = variant.id === logoVariant
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => selectLogoVariant(variant.id)}
                        title={`${variant.label} — ${variant.description}`}
                        className={`flex flex-col items-center justify-center p-1.5 rounded-xl border transition-all ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-600/20 shadow-sm'
                            : 'border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5 hover:border-slate-300 dark:hover:border-white/10'
                        }`}
                      >
                        <img src={variant.src} alt="" className="size-6 object-contain" />
                        <span className="text-[9px] font-medium text-slate-600 dark:text-slate-300 truncate mt-1 w-full text-center">
                          {variant.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Error Banner */}
            {authError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-300 hero-in">
                <AlertTriangle className="size-4 shrink-0 text-rose-500 mt-0.5" />
                <span className="flex-1">{authError}</span>
              </div>
            )}

            {/* GitHub OAuth Button */}
            <button
              type="button"
              onClick={() => void handleGitHubOAuthSignIn()}
              className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-700/50 dark:border-white/10 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition active:scale-[0.99]"
            >
              <GitBranch className="size-4 text-indigo-400" />
              Continuar con GitHub OAuth
            </button>

            {/* Divider */}
            <div className="relative flex items-center py-0.5">
              <div className="flex-grow border-t border-slate-200 dark:border-white/10" />
              <span className="mx-3 text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-mono">
                o con email
              </span>
              <div className="flex-grow border-t border-slate-200 dark:border-white/10" />
            </div>

            {/* Email Form */}
            <form onSubmit={handleEmailSignIn} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="admin@github-intelligence.com"
                  className="w-full rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-[#090d16] px-3.5 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Contraseña
                </label>
                <input
                  type="password"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-[#090d16] px-3.5 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-600/20 transition active:scale-[0.99]"
              >
                {submitting ? 'Autenticando...' : 'Iniciar Sesión'}
              </button>
            </form>
          </div>
        </main>

        {/* Minimal Footer */}
        <footer className="relative z-20 flex h-14 items-center justify-between px-6 lg:px-12 border-t border-slate-200 dark:border-white/5 text-xs text-slate-500 dark:text-slate-500">
          <span>GitHub Intelligence &copy; {new Date().getFullYear()}</span>
          <span className="flex items-center gap-1.5">
            <Shield className="size-3.5 text-indigo-500" />
            Acceso Autorizado
          </span>
        </footer>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Pantalla de Acceso Denegado (403 Forbidden)
  // ---------------------------------------------------------------------------
  if (authStatus === 'forbidden' || !session) {
    return (
      <div className="relative min-h-screen bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 flex items-center justify-center p-6 overflow-hidden transition-colors duration-200">
        <div className="pointer-events-none absolute inset-0 bg-dot-pattern [mask-image:radial-gradient(600px_circle_at_center,white,transparent)]" />
        
        <div className="relative z-10 w-full max-w-md rounded-2xl border border-rose-500/30 bg-white dark:bg-[#0f172a]/90 backdrop-blur-xl p-6 shadow-xl dark:shadow-2xl space-y-5 hero-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="flex size-10 items-center justify-center rounded-xl bg-rose-500/10 border border-rose-500/20">
                <ShieldAlert className="size-6 text-rose-500" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-slate-900 dark:text-white">403 — Acceso Denegado</h1>
                <p className="text-xs text-rose-500">Rol de administrador no encontrado</p>
              </div>
            </div>
            <ThemeToggle theme={theme} onToggle={toggleTheme} compact />
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Has iniciado sesión como <span className="font-mono font-semibold text-slate-900 dark:text-white">{session?.email || session?.userId}</span>, pero este perfil no tiene el rol <code className="text-rose-500 font-semibold">admin</code> asignado en la base de datos Supabase.
          </p>

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-4 py-2.5 text-xs font-medium text-slate-900 dark:text-white transition"
          >
            <LogOut className="size-4" />
            Cerrar Sesión e Intentar con Otra Cuenta
          </button>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Layout Principal Autorizado
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 flex flex-col lg:flex-row antialiased transition-colors duration-200">
      
      {/* Sidebar Desktop & Mobile Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#0b1120]/95 backdrop-blur-xl flex flex-col justify-between transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full overflow-hidden">
          
          {/* Sidebar Header / Brand Switcher */}
          <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
            <a href="/" className="flex items-center gap-3 group min-w-0">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 dark:from-indigo-500/20 dark:to-purple-500/20 border border-slate-200 dark:border-white/10 p-1 group-hover:scale-105 transition-transform shadow-sm">
                <img
                  src={currentLogo.src}
                  alt="Logo"
                  className="size-full object-contain"
                />
              </div>
              <div className="grid text-left leading-tight min-w-0">
                <span className="font-bold text-slate-900 dark:text-white text-sm tracking-tight truncate">
                  GitHub Intelligence
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5 truncate">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  Admin Console v2.0
                </span>
              </div>
            </a>

            {/* Mobile close button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Cerrar menú"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Sidebar Navigation (Categorized) */}
          <div className="flex-1 overflow-y-auto p-3 space-y-6">
            {NAV_GROUPS.map((group, groupIdx) => (
              <div key={groupIdx} className="space-y-1">
                <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
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
                            ? 'bg-indigo-50 dark:bg-indigo-600/20 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon className={`size-4 shrink-0 transition-colors ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 group-hover:text-slate-700 dark:group-hover:text-white'}`} />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                            isActive
                              ? 'bg-indigo-100 dark:bg-indigo-500/30 text-indigo-700 dark:text-indigo-200'
                              : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400'
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

          {/* Sidebar Footer (NavUser + Theme Toggle) */}
          <div className="p-3 border-t border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-[#090d16]/60">
            <div className="flex items-center justify-between gap-2 rounded-xl p-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 shadow-sm">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 font-semibold text-xs border border-indigo-200 dark:border-indigo-500/30">
                  {session.email?.slice(0, 2).toUpperCase() || 'AD'}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-900 dark:text-white truncate">
                    {session.email || 'Admin Principal'}
                  </div>
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                    Super Admin
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <ThemeToggle theme={theme} onToggle={toggleTheme} compact />
                <button
                  type="button"
                  onClick={handleSignOut}
                  title="Cerrar Sesión"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                >
                  <LogOut className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Backdrop for mobile */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Top AppHeader */}
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 dark:border-white/10 bg-white/80 dark:bg-[#090d16]/80 backdrop-blur-md px-4 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              aria-label="Abrir navegación"
            >
              <Menu className="size-4" />
            </button>

            {/* Breadcrumb Path */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="hover:text-slate-900 dark:hover:text-slate-200 transition">Consola</span>
              <ChevronRight className="size-3 text-slate-400 dark:text-slate-600" />
              <span className="font-semibold text-slate-900 dark:text-white truncate">{title}</span>
            </div>
          </div>

          {/* Header Right Actions */}
          <div className="flex items-center gap-2.5">
            <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-600 dark:text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              KV Sincronizado
            </div>

            <ThemeToggle theme={theme} onToggle={toggleTheme} />

            <a
              href="https://github-intelligence-api.crunaldo2.workers.dev/v1/config"
              target="_blank"
              rel="noreferrer"
              className="hidden md:inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 px-2.5 py-1 text-xs text-slate-700 dark:text-slate-300 transition"
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 dark:border-white/10 pb-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
            </div>
          </div>

          {children({ client: activeClient, session })}
        </main>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Componente KpiCard Mejorado
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
      badgeBg: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
      sparkColor: '#6366f1'
    },
    emerald: {
      border: 'border-emerald-500/20 hover:border-emerald-500/40',
      iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white',
      badgeBg: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      sparkColor: '#10b981'
    },
    amber: {
      border: 'border-amber-500/20 hover:border-amber-500/40',
      iconBg: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white',
      badgeBg: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
      sparkColor: '#f59e0b'
    },
    sky: {
      border: 'border-sky-500/20 hover:border-sky-500/40',
      iconBg: 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white',
      badgeBg: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
      sparkColor: '#0ea5e9'
    },
    purple: {
      border: 'border-purple-500/20 hover:border-purple-500/40',
      iconBg: 'bg-gradient-to-br from-purple-500 to-violet-600 text-white',
      badgeBg: 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300',
      sparkColor: '#a855f7'
    },
    rose: {
      border: 'border-rose-500/20 hover:border-rose-500/40',
      iconBg: 'bg-gradient-to-br from-rose-500 to-red-600 text-white',
      badgeBg: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
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
      className={`relative overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 ${accentConfig.border} bg-white dark:bg-[#0f172a]/80 backdrop-blur-md p-5 shadow-sm transition-all bg-dot-pattern-dense`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
        {icon && (
          <div className="flex size-9 items-center justify-center rounded-xl p-0.5 border border-slate-200 dark:border-white/10 shadow-sm">
            <div className={`flex size-full items-center justify-center rounded-[10px] ${accentConfig.iconBg}`}>
              {icon}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</div>
        {(badge || trend) && (
          <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${accentConfig.badgeBg}`}>
            {badge || trend}
          </span>
        )}
      </div>

      {hint && (
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
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
    <section className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f172a]/75 backdrop-blur-md p-5 sm:p-6 shadow-sm hover:border-slate-300 dark:hover:border-white/15 transition-all space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-white/5 pb-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white tracking-tight">{title}</h2>
          {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
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
