import { useState, useEffect } from 'react'
import {
  KeyRound,
  Check,
  CheckCircle2,
  RefreshCw,
  Sun,
  Moon,
  Laptop,
  Trash2,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  HelpCircle,
  Zap,
  Globe,
  Sparkles,
  LogOut,
  FolderTree,
  ChevronDown,
  ChevronRight,
  Users,
} from 'lucide-react'
import { AnalysisMascot } from './AnalysisMascot'
import type { ExtensionPreferences } from '../storage'
import { DEFAULT_CODE_TREE_PREFERENCES } from '../storage'
import { resolveActiveLanguage, detectSystemLanguage, t, type AppLanguage, type ActiveLocale } from '../i18n'
import {
  getAuthSession,
  initiateProUpgrade,
  refreshProStatus,
  signInWithGitHub,
  signOut,
  type AuthSession,
} from '../auth/supabaseAuth'

type SettingsViewProps = {
  preferences: ExtensionPreferences
  onSavePreferences: (prefs: Partial<ExtensionPreferences>) => Promise<void>
  onClearCache: () => Promise<void>
  locale?: ActiveLocale
}

const GITHUB_NEW_TOKEN_URL =
  'https://github.com/settings/tokens/new?scopes=public_repo&description=GitHub%20Project%20Intelligence%20Assistant'

export function SettingsView({ preferences, onSavePreferences, onClearCache, locale }: SettingsViewProps) {
  const activeLocale = locale || resolveActiveLanguage(preferences.language)
  const systemDetectedLocale = detectSystemLanguage()

  const [token, setToken] = useState(preferences.githubToken || '')
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [testingToken, setTestingToken] = useState(false)
  const [tokenTestResult, setTokenTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [clearedNotice, setClearedNotice] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [authSession, setAuthSession] = useState<AuthSession | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [authNotice, setAuthNotice] = useState<string | null>(null)
  const [newProfileLabel, setNewProfileLabel] = useState('')
  const [newProfileToken, setNewProfileToken] = useState('')
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#code-tree-settings') {
      setOpenSections({ codeTree: true })
    }
  }, [])

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleAddProfile = async () => {
    if (!newProfileToken.trim()) return
    const id = `profile_${Date.now()}`
    const newProfile = {
      id,
      label: newProfileLabel.trim() || `Profile ${(preferences.tokenProfiles || []).length + 1}`,
      token: newProfileToken.trim(),
    }
    const nextProfiles = [...(preferences.tokenProfiles || []), newProfile]
    await onSavePreferences({
      tokenProfiles: nextProfiles,
      activeProfileId: id,
      githubToken: newProfile.token,
    })
    setNewProfileLabel('')
    setNewProfileToken('')
  }

  const handleSelectProfile = async (profileId: string) => {
    if (profileId === 'default') {
      await onSavePreferences({
        activeProfileId: 'default',
      })
      return
    }
    const found = (preferences.tokenProfiles || []).find((p) => p.id === profileId)
    if (found) {
      setToken(found.token)
      await onSavePreferences({
        activeProfileId: found.id,
        githubToken: found.token,
      })
    }
  }

  const handleDeleteProfile = async (profileId: string) => {
    const nextProfiles = (preferences.tokenProfiles || []).filter((p) => p.id !== profileId)
    const isDeletingActive = preferences.activeProfileId === profileId
    if (isDeletingActive) {
      setToken('')
    }
    await onSavePreferences({
      tokenProfiles: nextProfiles,
      ...(isDeletingActive ? { activeProfileId: 'default', githubToken: '' } : {}),
    })
  }

  useEffect(() => {
    let cancelled = false
    void getAuthSession().then((session) => {
      if (!cancelled) setAuthSession(session)
      if (session) {
        void refreshProStatus().then((refreshed) => {
          if (!cancelled && refreshed) {
            setAuthSession(refreshed)
          }
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleGitHubSignIn = async () => {
    setAuthNotice(null)
    setAuthBusy(true)
    try {
      const session = await signInWithGitHub()
      if (!session) {
        setAuthNotice(t('auth_cancelled_notice', activeLocale))
      }
      setAuthSession(session)
    } catch (err) {
      setAuthNotice(
        err instanceof Error && err.message ? err.message : t('auth_cancelled_notice', activeLocale)
      )
    } finally {
      setAuthBusy(false)
    }
  }

  const handleSignOut = async () => {
    setAuthNotice(null)
    setAuthBusy(true)
    try {
      await signOut()
      setAuthSession(null)
    } finally {
      setAuthBusy(false)
    }
  }

  const handleUpgradeToPro = async () => {
    setAuthNotice(null)
    setAuthBusy(true)
    try {
      const session = await initiateProUpgrade()
      if (!session) {
        setAuthNotice(t('upgrade_cancelled_notice', activeLocale))
      }
      setAuthSession(await getAuthSession())
    } catch (err) {
      setAuthNotice(
        err instanceof Error && err.message
          ? err.message
          : t('upgrade_cancelled_notice', activeLocale)
      )
    } finally {
      setAuthBusy(false)
    }
  }

  const handleRefreshProStatus = async () => {
    setAuthNotice(null)
    setAuthBusy(true)
    try {
      const refreshed = await refreshProStatus()
      setAuthSession(refreshed)
      if (refreshed?.isPro) {
        setAuthNotice(
          activeLocale === 'es'
            ? '¡Suscripción Pro activa confirmada!'
            : 'Active Pro subscription verified!'
        )
      } else {
        setAuthNotice(
          activeLocale === 'es'
            ? 'Aún no se detecta suscripción Pro activa. Si acabas de pagar, reintenta en unos segundos.'
            : 'No active Pro subscription detected yet. If you recently upgraded, retry in a moment.'
        )
      }
    } catch (err) {
      setAuthNotice(err instanceof Error && err.message ? err.message : t('ai_error_notice', activeLocale))
    } finally {
      setAuthBusy(false)
    }
  }

  const handleSaveToken = async () => {
    await onSavePreferences({ githubToken: token.trim() })
    setSavedSuccess(true)
    setTimeout(() => setSavedSuccess(false), 2500)
  }

  const handleTestToken = async () => {
    if (!token.trim()) {
      setTokenTestResult({
        ok: false,
        message: activeLocale === 'es' ? 'Ingresa un token antes de probarlo.' : 'Enter a token before testing.',
      })
      return
    }
    setTestingToken(true)
    setTokenTestResult(null)
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Accept: 'application/vnd.github+json',
        },
      })
      if (res.ok) {
        const data = await res.json()
        setTokenTestResult({
          ok: true,
          message:
            activeLocale === 'es'
              ? `¡Token válido! Conectado localmente como @${data.login || 'usuario'}. Análisis profundo y funciones Pro habilitadas.`
              : `Valid token! Connected locally as @${data.login || 'user'}. Deep repository analysis and Pro features enabled.`,
        })
        await onSavePreferences({ githubToken: token.trim() })
      } else {
        setTokenTestResult({
          ok: false,
          message:
            activeLocale === 'es'
              ? `Error de GitHub: HTTP ${res.status}. Verifica que el token sea correcto y no haya expirado.`
              : `GitHub error: HTTP ${res.status}. Verify the token is correct and has not expired.`,
        })
      }
    } catch (err) {
      setTokenTestResult({
        ok: false,
        message:
          activeLocale === 'es'
            ? `Error de conexión: ${err instanceof Error ? err.message : String(err)}`
            : `Connection error: ${err instanceof Error ? err.message : String(err)}`,
      })
    } finally {
      setTestingToken(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Pro Plan & Membership Card */}
      <div className={`insight-card pro-plan-hero-card ${authSession?.isPro ? 'is-pro' : ''}`}>
        {/* Top Header Row with Mascot, Title & Status */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flexShrink: 0 }}>
              <AnalysisMascot moodOverride={authSession?.isPro ? 'cool' : 'neutral'} size={38} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--text-primary)' }}>
                  {t('pro_plan_title', activeLocale)}
                </span>
                {authSession?.isPro ? (
                  <span className="pro-badge-pill active">
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: 'var(--accent-emerald)',
                      }}
                    />
                    {t('pro_badge_active', activeLocale)}
                  </span>
                ) : (
                  <span className="pro-badge-pill free">
                    {t('pro_badge_free', activeLocale)}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.4 }}>
                {authSession?.isPro
                  ? t('pro_active_license_msg', activeLocale)
                  : authSession
                    ? t('pro_plan_upgrade_desc', activeLocale)
                    : t('pro_plan_desc', activeLocale)}
              </div>
            </div>
          </div>

          {/* Price Tag: ONLY shown if NOT connected to account */}
          {!authSession && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
                  {t('pro_price_val', activeLocale)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {t('pro_price_interval', activeLocale)}
                </span>
              </div>
              <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>
                {t('pro_price_cancel_note', activeLocale)}
              </span>
            </div>
          )}
        </div>

        {/* Feature Benefits: ONLY shown if NOT Pro */}
        {!authSession?.isPro && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '6px 14px',
              paddingTop: 8,
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <div className="pro-benefit-item">
              <Check size={12} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} strokeWidth={2.5} />
              <span>{t('pro_feat_ai_limits', activeLocale)}</span>
            </div>
            <div className="pro-benefit-item">
              <Check size={12} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} strokeWidth={2.5} />
              <span>{t('pro_feat_octo_chat', activeLocale)}</span>
            </div>
            <div className="pro-benefit-item">
              <Check size={12} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} strokeWidth={2.5} />
              <span>{t('pro_feat_deep_audit', activeLocale)}</span>
            </div>
            <div className="pro-benefit-item">
              <Check size={12} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} strokeWidth={2.5} />
              <span>{t('pro_feat_code_tree', activeLocale)}</span>
            </div>
            <div className="pro-benefit-item">
              <Check size={12} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} strokeWidth={2.5} />
              <span>{t('pro_feat_multi_pat', activeLocale)}</span>
            </div>
            <div className="pro-benefit-item">
              <Check size={12} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} strokeWidth={2.5} />
              <span>{activeLocale === 'es' ? 'Caché acelerado en Edge (Cloudflare KV)' : 'Edge accelerated cache (Cloudflare KV)'}</span>
            </div>
          </div>
        )}

        {/* User Identity & Action Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            paddingTop: 8,
            borderTop: '1px solid var(--border-subtle)',
            flexWrap: 'wrap',
          }}
        >
          {authSession ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-medium)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--brand-primary)',
                }}
              >
                <Users size={12} />
              </div>
              <div style={{ fontSize: 11.5 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t('pro_connected_as', activeLocale)} </span>
                <strong style={{ color: 'var(--text-primary)' }}>
                  @{authSession.user.userName || authSession.user.email || authSession.user.id}
                </strong>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={12} style={{ color: 'var(--brand-primary)' }} />
              <span>
                {activeLocale === 'es'
                  ? 'Conecta GitHub para sincronizar tu cuenta'
                  : 'Connect GitHub to sync your account'}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {!authSession && (
              <button
                type="button"
                className="btn-github-auth"
                onClick={() => void handleGitHubSignIn()}
                disabled={authBusy}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
                <span>{t('pro_sign_in_github', activeLocale)}</span>
              </button>
            )}

            {!authSession?.isPro && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleUpgradeToPro()}
                disabled={authBusy}
              >
                <Sparkles size={13} />
                <span>
                  {authSession
                    ? (activeLocale === 'es' ? 'Mejorar a Pro' : 'Upgrade to Pro')
                    : t('pro_upgrade_btn', activeLocale)}
                </span>
              </button>
            )}

            {authSession?.isPro && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  color: 'var(--accent-emerald)',
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '5px 9px',
                }}
              >
                <CheckCircle2 size={13} />
                <span>{activeLocale === 'es' ? 'Licencia Pro Verificada' : 'Pro License Verified'}</span>
              </div>
            )}

            {authSession && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void handleRefreshProStatus()}
                disabled={authBusy}
                title={t('pro_refresh_status', activeLocale)}
              >
                <RefreshCw size={11} className={authBusy ? 'animate-spin' : ''} />
                <span>{t('pro_refresh_status', activeLocale)}</span>
              </button>
            )}

            {authSession && (
              <button
                type="button"
                className="btn-secondary btn-signout"
                onClick={() => void handleSignOut()}
                disabled={authBusy}
                title={t('pro_sign_out', activeLocale)}
              >
                <LogOut size={11} />
                <span>{t('pro_sign_out', activeLocale)}</span>
              </button>
            )}
          </div>
        </div>

        {authNotice && (
          <div
            role="alert"
            style={{
              marginTop: 6,
              padding: '7px 10px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 11.5,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              background: 'rgba(245, 158, 11, 0.1)',
              color: 'var(--accent-amber)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
            }}
          >
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <span>{authNotice}</span>
          </div>
        )}
      </div>

      {/* 2. GitHub Token Configuration Card (Collapsible) */}
      <div className="insight-card" style={{ border: '1px solid var(--border-medium)', padding: 0, overflow: 'hidden' }}>
        <div
          onClick={() => toggleSection('token')}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 14px',
            cursor: 'pointer',
            userSelect: 'none',
            background: openSections.token ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyRound size={16} style={{ color: 'var(--brand-primary)' }} />
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
              {t('github_token_title', activeLocale)}
            </span>
            {authSession?.user?.id ? (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 10,
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: 'var(--accent-emerald)',
                }}
              >
                {activeLocale === 'es' ? 'Cuenta conectada (OAuth oficial)' : 'Connected Account (Official OAuth)'}
              </span>
            ) : token.trim() && !token.trim().startsWith('gho_') ? (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 10,
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: 'var(--accent-emerald)',
                }}
              >
                {activeLocale === 'es' ? 'Token manual activo' : 'Manual token active'}
              </span>
            ) : (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 10,
                  background: 'rgba(56, 189, 248, 0.12)',
                  color: 'var(--brand-primary)',
                }}
              >
                {activeLocale === 'es' ? 'Opcional' : 'Optional'}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {openSections.token ? (
              <ChevronDown size={15} style={{ color: 'var(--text-muted)' }} />
            ) : (
              <ChevronRight size={15} style={{ color: 'var(--text-muted)' }} />
            )}
          </div>
        </div>

        {openSections.token && (
          <div style={{ padding: '0 14px 14px 14px', borderTop: '1px solid var(--border-subtle)' }}>
            {/* Informative Callout */}
            {authSession?.user?.id ? (
              <div
                style={{
                  marginTop: 12,
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11.5,
                  color: 'var(--text-secondary)',
                }}
              >
                <ShieldCheck size={16} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />
                <span>
                  {activeLocale === 'es'
                    ? 'Tu cuenta de GitHub ya está conectada y autenticada por OAuth oficial. No necesitas configurar ningún token manual aquí. Esta sección solo es requerida para instancias privadas de GitHub Enterprise o tokens personalizados con alcances avanzados.'
                    : 'Your GitHub account is already connected and authenticated via official OAuth. No manual token is required here. This section is only needed for private GitHub Enterprise instances or custom-scoped tokens.'}
                </span>
              </div>
            ) : (
              <div
                style={{
                  marginTop: 12,
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  background: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11.5,
                  color: 'var(--text-secondary)',
                }}
              >
                <Sparkles size={16} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
                <span>
                  {activeLocale === 'es'
                    ? 'Consejo: Si inicias sesión con GitHub en la sección superior, tu autenticación se configurará automáticamente en 1 clic sin necesidad de generar ni pegar ningún token manual.'
                    : 'Tip: If you sign in with GitHub in the section above, your authentication is configured automatically with 1 click without generating a manual token.'}
                </span>
              </div>
            )}

            {/* Why add a token alert box */}
            <div className="token-benefit-box" style={{ marginTop: 10 }}>
              <Zap size={14} className="text-amber" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>{t('token_benefit_title', activeLocale)}</strong>
                <p style={{ margin: '3px 0 0', fontSize: 11.5, lineHeight: 1.45, color: 'var(--text-secondary)' }}>
                  {t('token_benefit_desc', activeLocale)}
                </p>
              </div>
            </div>

            {/* Short Step-by-Step Instructions */}
            <div className="token-instructions-card">
              <div
                className="instructions-header"
                onClick={() => setShowInstructions((v) => !v)}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 12, color: 'var(--text-primary)' }}>
                  <HelpCircle size={14} style={{ color: 'var(--brand-primary)' }} />
                  <span>{t('instructions_title', activeLocale)}</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {showInstructions ? (activeLocale === 'es' ? 'Ocultar ▲' : 'Hide ▲') : (activeLocale === 'es' ? 'Ver ▼' : 'Show ▼')}
                </span>
              </div>

              {showInstructions && (
                <>
                  <ol className="instructions-steps-list">
                    <li>{t('instruction_1', activeLocale)}</li>
                    <li>{t('instruction_2', activeLocale)}</li>
                    <li>{t('instruction_3', activeLocale)}</li>
                    <li>{t('instruction_4', activeLocale)}</li>
                    <li>{t('instruction_5', activeLocale)}</li>
                    <li>{t('instruction_6', activeLocale)}</li>
                  </ol>
                  <div style={{ marginTop: 8 }}>
                    <a
                      href={GITHUB_NEW_TOKEN_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-github-direct"
                      title="GitHub Personal Access Token page"
                      style={{ padding: '4px 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    >
                      <span>{t('btn_create_token', activeLocale)}</span>
                      <ExternalLink size={11} />
                    </a>
                  </div>
                </>
              )}
            </div>

            {/* Token Input & Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input
                type="password"
                placeholder={t('paste_token_placeholder', activeLocale)}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-medium)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                }}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={handleSaveToken}
                style={{ borderColor: savedSuccess ? 'var(--accent-emerald)' : undefined }}
              >
                {savedSuccess ? <Check size={13} style={{ color: 'var(--accent-emerald)' }} /> : null}
                <span>{savedSuccess ? t('btn_saved', activeLocale) : t('btn_save', activeLocale)}</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleTestToken}
                disabled={testingToken}
              >
                {testingToken ? <RefreshCw size={13} className="animate-spin" /> : t('btn_verify', activeLocale)}
              </button>
            </div>

            {tokenTestResult && (
              <div
                style={{
                  marginTop: 10,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: tokenTestResult.ok ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
                  color: tokenTestResult.ok ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                  border: `1px solid ${tokenTestResult.ok ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                }}
              >
                <ShieldCheck size={16} />
                <span>{tokenTestResult.message}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2.2 Token Profiles (Multi-Account PAT) (Collapsible) */}
      <div className="insight-card" id="token-profiles-settings" style={{ border: '1px solid var(--border-medium)', padding: 0, overflow: 'hidden' }}>
        <div
          onClick={() => toggleSection('tokenProfiles')}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 14px',
            cursor: 'pointer',
            userSelect: 'none',
            background: openSections.tokenProfiles ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={16} style={{ color: 'var(--brand-primary)' }} />
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
              {t('token_profiles_title', activeLocale)}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 10,
                background: (preferences.tokenProfiles || []).length > 0 ? 'var(--brand-primary-soft)' : 'rgba(100, 116, 139, 0.15)',
                color: (preferences.tokenProfiles || []).length > 0 ? 'var(--brand-primary)' : 'var(--text-muted)',
              }}
            >
              {(preferences.tokenProfiles || []).length} {activeLocale === 'es' ? 'perfiles' : 'profiles'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {openSections.tokenProfiles ? (
              <ChevronDown size={15} style={{ color: 'var(--text-muted)' }} />
            ) : (
              <ChevronRight size={15} style={{ color: 'var(--text-muted)' }} />
            )}
          </div>
        </div>

        {openSections.tokenProfiles && (
          <div style={{ padding: '0 14px 14px 14px', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '10px 0 12px' }}>
              {t('token_profiles_desc', activeLocale)}
            </div>

            {/* Existing Profiles List */}
            {preferences.tokenProfiles && preferences.tokenProfiles.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {preferences.tokenProfiles.map((p) => {
                  const isActive = preferences.activeProfileId === p.id
                  return (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: isActive ? 'var(--brand-primary-soft)' : 'var(--bg-input)',
                        border: `1px solid ${isActive ? 'var(--brand-primary)' : 'var(--border-subtle)'}`,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectProfile(p.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: 12, color: isActive ? 'var(--brand-primary)' : 'var(--text-primary)' }}>
                          {p.label}
                        </span>
                        {isActive && (
                          <span style={{ fontSize: 10, background: 'var(--brand-primary)', color: '#fff', padding: '1px 5px', borderRadius: 10, fontWeight: 700 }}>
                            {t('token_profiles_active', activeLocale)}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProfile(p.id)}
                        className="btn-secondary"
                        style={{ padding: '3px 6px', color: 'var(--accent-rose)', border: 'none' }}
                        title={t('token_profiles_delete', activeLocale)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add New Profile */}
            <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 6 }}>
                <input
                  type="text"
                  placeholder={t('token_profiles_label_placeholder', activeLocale)}
                  value={newProfileLabel}
                  onChange={(e) => setNewProfileLabel(e.target.value)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-medium)',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                  }}
                />
                <input
                  type="password"
                  placeholder={t('token_profiles_token_placeholder', activeLocale)}
                  value={newProfileToken}
                  onChange={(e) => setNewProfileToken(e.target.value)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-medium)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                  }}
                />
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={handleAddProfile}
                disabled={!newProfileToken.trim()}
                style={{
                  padding: '6px 10px',
                  fontSize: 12,
                  justifyContent: 'center',
                }}
              >
                <span>{t('token_profiles_add', activeLocale)}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2.5 Code Tree Lateral Dock Settings Card (Collapsible) */}
      {(() => {
        const codeTree = preferences.codeTree || DEFAULT_CODE_TREE_PREFERENCES
        const isTreeEnabled = codeTree.enabled !== false
        return (
          <div
            id="code-tree-settings"
            className="insight-card"
            style={{
              border: '1px solid var(--border-medium)',
              scrollMarginTop: 16,
              transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
              padding: 0,
              overflow: 'hidden',
            }}
          >
            <div
              onClick={() => toggleSection('codeTree')}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 14px',
                cursor: 'pointer',
                userSelect: 'none',
                background: openSections.codeTree ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FolderTree size={16} style={{ color: 'var(--brand-primary)' }} />
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                  {t('code_tree_settings_title', activeLocale)}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 10,
                    background: isTreeEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                    color: isTreeEnabled ? 'var(--accent-emerald)' : 'var(--text-muted)',
                  }}
                >
                  {isTreeEnabled ? t('code_tree_status_active', activeLocale) : t('code_tree_status_disabled', activeLocale)}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {openSections.codeTree ? (
                  <ChevronDown size={15} style={{ color: 'var(--text-muted)' }} />
                ) : (
                  <ChevronRight size={15} style={{ color: 'var(--text-muted)' }} />
                )}
              </div>
            </div>

            {openSections.codeTree && (
              <div style={{ padding: '0 14px 14px 14px', borderTop: '1px solid var(--border-subtle)' }}>
                <p style={{ margin: '10px 0 14px', fontSize: 12, lineHeight: 1.45, color: 'var(--text-secondary)' }}>
                  {t('code_tree_settings_desc', activeLocale)}
                </p>

                {/* 1. Master Enable / Disable Function Toggle */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: isTreeEnabled ? 'var(--brand-primary-soft)' : 'var(--bg-input)',
                    border: `1px solid ${isTreeEnabled ? 'var(--brand-primary)' : 'var(--border-subtle)'}`,
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--text-primary)' }}>
                      {t('code_tree_enabled', activeLocale)}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {t('code_tree_enabled_desc', activeLocale)}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    aria-label={t('code_tree_enabled', activeLocale)}
                    checked={isTreeEnabled}
                    onChange={(e) => void onSavePreferences({ codeTree: { ...codeTree, enabled: e.target.checked } })}
                    style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--brand-primary)' }}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    opacity: isTreeEnabled ? 1 : 0.45,
                    pointerEvents: isTreeEnabled ? 'auto' : 'none',
                    transition: 'opacity 0.2s ease',
                  }}
                >
                  {/* Pin per window */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text-primary)' }}>
                        {t('code_tree_pin_per_window', activeLocale)}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {t('code_tree_pin_per_window_desc', activeLocale)}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={codeTree.pinPerWindow}
                      onChange={(e) => void onSavePreferences({ codeTree: { ...codeTree, pinPerWindow: e.target.checked } })}
                      style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--brand-primary)' }}
                    />
                  </div>

                  {/* Open folders on click */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text-primary)' }}>
                        {t('code_tree_open_folders_click', activeLocale)}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {t('code_tree_open_folders_click_desc', activeLocale)}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={codeTree.openFoldersOnClick}
                      onChange={(e) => void onSavePreferences({ codeTree: { ...codeTree, openFoldersOnClick: e.target.checked } })}
                      style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--brand-primary)' }}
                    />
                  </div>

                  {/* Hover to open */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text-primary)' }}>
                        {t('code_tree_hover_to_open', activeLocale)}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {t('code_tree_hover_to_open_desc', activeLocale)}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={codeTree.hoverToOpen}
                      onChange={(e) => void onSavePreferences({ codeTree: { ...codeTree, hoverToOpen: e.target.checked } })}
                      style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--brand-primary)' }}
                    />
                  </div>

                  <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

                  {/* Tab Position (Left vs Right) */}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text-primary)', marginBottom: 6 }}>
                      {t('code_tree_position', activeLocale)}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {(['left', 'right'] as const).map((pos) => {
                        const isSelected = codeTree.tabPosition === pos
                        return (
                          <button
                            key={pos}
                            type="button"
                            className={`btn-secondary ${isSelected ? 'active' : ''}`}
                            onClick={() => void onSavePreferences({ codeTree: { ...codeTree, tabPosition: pos } })}
                            style={{
                              justifyContent: 'center',
                              padding: '7px 10px',
                              borderRadius: 'var(--radius-sm)',
                              borderColor: isSelected ? 'var(--brand-primary)' : undefined,
                              background: isSelected ? 'var(--brand-primary-soft)' : undefined,
                              color: isSelected ? 'var(--brand-primary)' : 'var(--text-primary)',
                              fontWeight: isSelected ? 700 : 500,
                            }}
                          >
                            <span>{pos === 'left' ? t('code_tree_position_left', activeLocale) : t('code_tree_position_right', activeLocale)}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Vertical position slider */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text-primary)' }}>
                        {t('code_tree_vertical_pos', activeLocale)}
                      </div>
                      <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--brand-primary)', fontWeight: 700 }}>
                        {codeTree.tabVerticalPos}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={80}
                      step={2}
                      value={codeTree.tabVerticalPos}
                      onChange={(e) => void onSavePreferences({ codeTree: { ...codeTree, tabVerticalPos: Number(e.target.value) } })}
                      style={{ width: '100%', accentColor: 'var(--brand-primary)', cursor: 'pointer' }}
                    />
                  </div>

                  <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

                  {/* Shortcut input */}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text-primary)' }}>
                      {t('code_tree_shortcut', activeLocale)}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2, marginBottom: 6 }}>
                      {t('code_tree_shortcut_desc', activeLocale)}
                    </div>
                    <input
                      type="text"
                      placeholder={t('code_tree_shortcut_placeholder', activeLocale)}
                      value={codeTree.shortcut}
                      onChange={(e) => void onSavePreferences({ codeTree: { ...codeTree, shortcut: e.target.value } })}
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-medium)',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                      }}
                    />
                  </div>

                  {/* Hide when URL matches input */}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text-primary)' }}>
                      {t('code_tree_hide_urls', activeLocale)}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2, marginBottom: 6 }}>
                      {t('code_tree_hide_urls_desc', activeLocale)}
                    </div>
                    <input
                      type="text"
                      placeholder={t('code_tree_hide_urls_placeholder', activeLocale)}
                      value={codeTree.hideWhenUrlMatches}
                      onChange={(e) => void onSavePreferences({ codeTree: { ...codeTree, hideWhenUrlMatches: e.target.value } })}
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-medium)',
                        color: 'var(--text-primary)',
                        fontSize: 12,
                      }}
                    />
                  </div>

                  <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

                  {/* Icon Theme Selector */}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text-primary)', marginBottom: 4 }}>
                      {t('code_tree_icon_theme', activeLocale)}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      {t('code_tree_icon_theme_desc', activeLocale)}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                      {(['vscode', 'seti', 'github'] as const).map((th) => {
                        const isSelected = (codeTree.iconTheme || 'vscode') === th
                        return (
                          <button
                            key={th}
                            type="button"
                            className={`btn-secondary ${isSelected ? 'active' : ''}`}
                            onClick={() => void onSavePreferences({ codeTree: { ...codeTree, iconTheme: th } })}
                            style={{
                              justifyContent: 'center',
                              padding: '6px 8px',
                              fontSize: 11,
                              borderRadius: 'var(--radius-sm)',
                              borderColor: isSelected ? 'var(--brand-primary)' : undefined,
                              background: isSelected ? 'var(--brand-primary-soft)' : undefined,
                              color: isSelected ? 'var(--brand-primary)' : 'var(--text-primary)',
                              fontWeight: isSelected ? 700 : 500,
                            }}
                          >
                            <span>{th === 'vscode' ? 'VS Code' : th === 'seti' ? 'Seti UI' : 'GitHub'}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

                  {/* Code Font Family */}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text-primary)' }}>
                      {t('code_tree_font_family', activeLocale)}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2, marginBottom: 6 }}>
                      {t('code_tree_font_family_desc', activeLocale)}
                    </div>
                    <select
                      aria-label={t('code_tree_font_family', activeLocale)}
                      value={codeTree.codeFontFamily || 'default'}
                      onChange={(e) => void onSavePreferences({ codeTree: { ...codeTree, codeFontFamily: e.target.value as any } })}
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-medium)',
                        color: 'var(--text-primary)',
                        fontSize: 12,
                      }}
                    >
                      <option value="default">GitHub Native (Default)</option>
                      <option value="jetbrains">JetBrains Mono</option>
                      <option value="fira">Fira Code</option>
                      <option value="cascadia">Cascadia Code</option>
                      <option value="source-code">Source Code Pro</option>
                    </select>
                  </div>

                  {/* Code Font Size */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text-primary)' }}>
                        {t('code_tree_font_size', activeLocale)}
                      </div>
                      <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--brand-primary)', fontWeight: 700 }}>
                        {codeTree.codeFontSize || 13}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={11}
                      max={20}
                      step={1}
                      value={codeTree.codeFontSize || 13}
                      onChange={(e) => void onSavePreferences({ codeTree: { ...codeTree, codeFontSize: Number(e.target.value) } })}
                      style={{ width: '100%', accentColor: 'var(--brand-primary)', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Code Font Ligatures */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text-primary)' }}>
                        {t('code_tree_font_ligatures', activeLocale)}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {t('code_tree_font_ligatures_desc', activeLocale)}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={codeTree.codeFontLigatures !== false}
                      onChange={(e) => void onSavePreferences({ codeTree: { ...codeTree, codeFontLigatures: e.target.checked } })}
                      style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--brand-primary)' }}
                    />
                  </div>

                  <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

                  {/* Custom Enterprise Domains */}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text-primary)' }}>
                      {t('code_tree_enterprise_domains', activeLocale)}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2, marginBottom: 6 }}>
                      {t('code_tree_enterprise_domains_desc', activeLocale)}
                    </div>
                    <input
                      type="text"
                      placeholder={t('code_tree_enterprise_placeholder', activeLocale)}
                      value={codeTree.customEnterpriseDomains || ''}
                      onChange={(e) => void onSavePreferences({ codeTree: { ...codeTree, customEnterpriseDomains: e.target.value } })}
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-medium)',
                        color: 'var(--text-primary)',
                        fontSize: 12,
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Auto-Sync Setting */}
      <div className="insight-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
              {t('auto_sync_title', activeLocale)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {t('auto_sync_desc', activeLocale)}
            </div>
          </div>
          <input
            type="checkbox"
            checked={preferences.autoSync}
            onChange={(e) => void onSavePreferences({ autoSync: e.target.checked })}
            style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--brand-primary)' }}
          />
        </div>
      </div>

      {/* Language Selector Card */}
      <div className="insight-card" style={{ border: '1px solid var(--border-medium)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Globe size={16} style={{ color: 'var(--brand-primary)' }} />
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
            {t('language_title', activeLocale)}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            {
              key: 'auto' as AppLanguage,
              label: t('language_auto', activeLocale),
              sub: `(${systemDetectedLocale.toUpperCase()})`,
            },
            {
              key: 'es' as AppLanguage,
              label: 'Español',
              sub: 'Spanish',
            },
            {
              key: 'en' as AppLanguage,
              label: 'English',
              sub: 'Inglés',
            },
          ].map(({ key, label, sub }) => {
            const isSelected = preferences.language === key
            return (
              <button
                key={key}
                type="button"
                className={`btn-secondary ${isSelected ? 'active' : ''}`}
                onClick={() => void onSavePreferences({ language: key })}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '9px 8px',
                  borderRadius: 'var(--radius-sm)',
                  borderColor: isSelected ? 'var(--brand-primary)' : undefined,
                  background: isSelected ? 'var(--brand-primary-soft)' : undefined,
                  color: isSelected ? 'var(--brand-primary)' : 'var(--text-primary)',
                  fontWeight: isSelected ? 700 : 500,
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ fontSize: 12 }}>{label}</span>
                <span style={{ fontSize: 10, opacity: 0.75, marginTop: 2 }}>{sub}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Theme Settings */}
      <div className="insight-card">
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 8 }}>
          {t('theme_title', activeLocale)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { key: 'dark', label: t('theme_dark', activeLocale), icon: Moon },
            { key: 'light', label: t('theme_light', activeLocale), icon: Sun },
            { key: 'system', label: t('theme_system', activeLocale), icon: Laptop },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={`btn-secondary ${preferences.theme === key ? 'active' : ''}`}
              onClick={() => void onSavePreferences({ theme: key as 'dark' | 'light' | 'system' })}
              style={{
                justifyContent: 'center',
                padding: '8px 10px',
                borderColor: preferences.theme === key ? 'var(--brand-primary)' : undefined,
                background: preferences.theme === key ? 'var(--brand-primary-soft)' : undefined,
                color: preferences.theme === key ? 'var(--brand-primary)' : undefined,
              }}
            >
              <Icon size={13} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Storage and Cache */}
      <div className="insight-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
              {t('storage_title', activeLocale)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {t('storage_desc', activeLocale)}
            </div>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={async () => {
              await onClearCache()
              setClearedNotice(true)
              setTimeout(() => setClearedNotice(false), 2000)
            }}
            style={{ color: 'var(--accent-rose)' }}
          >
            <Trash2 size={13} />
            <span>{clearedNotice ? t('btn_cleaned', activeLocale) : t('btn_clean', activeLocale)}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
