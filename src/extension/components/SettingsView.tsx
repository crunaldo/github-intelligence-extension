import { useState, useEffect } from 'react'
import {
  KeyRound,
  Check,
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
} from 'lucide-react'
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
  const [showInstructions, setShowInstructions] = useState(true)
  const [authSession, setAuthSession] = useState<AuthSession | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [authNotice, setAuthNotice] = useState<string | null>(null)

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
      {/* 1. Language Selector Card (Multi-language Support for Chrome Web Store) */}
      <div className="insight-card" style={{ border: '1px solid var(--border-medium)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Globe size={16} style={{ color: 'var(--accent-cyan)' }} />
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
                  borderColor: isSelected ? 'var(--accent-cyan)' : undefined,
                  background: isSelected ? 'var(--accent-cyan-subtle)' : undefined,
                  color: isSelected ? 'var(--accent-cyan)' : 'var(--text-primary)',
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

      {/* 1.5 Pro Plan & GitHub Authentication Card */}
      <div className="insight-card" style={{ border: '1px solid var(--border-medium)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div className="insight-title" style={{ color: 'var(--text-primary)', margin: 0 }}>
            <Sparkles size={16} style={{ color: 'var(--accent-cyan)' }} />
            <span>{t('pro_plan_title', activeLocale)}</span>
          </div>
          <span
            className="colloquial-chip"
            style={{
              fontWeight: 700,
              fontSize: 10,
              color: authSession?.isPro ? 'var(--accent-emerald)' : 'var(--text-secondary)',
            }}
          >
            {authSession?.isPro ? t('pro_badge_active', activeLocale) : t('pro_badge_free', activeLocale)}
          </span>
        </div>

        <p style={{ margin: '8px 0 12px', fontSize: 12, lineHeight: 1.45, color: 'var(--text-secondary)' }}>
          {t('pro_plan_desc', activeLocale)}
        </p>

        {authSession && (
          <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 10 }}>
            {t('pro_connected_as', activeLocale)}{' '}
            <strong>@{authSession.user.userName || authSession.user.email || authSession.user.id}</strong>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {!authSession && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void handleGitHubSignIn()}
              disabled={authBusy}
            >
              <span>{t('pro_sign_in_github', activeLocale)}</span>
            </button>
          )}

          {!authSession?.isPro && (
            <button
              type="button"
              className="btn-github-direct"
              onClick={() => void handleUpgradeToPro()}
              disabled={authBusy}
            >
              <Sparkles size={12} />
              <span>{t('pro_upgrade_btn', activeLocale)}</span>
            </button>
          )}

          {authSession && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void handleSignOut()}
              disabled={authBusy}
            >
              <LogOut size={12} />
              <span>{t('pro_sign_out', activeLocale)}</span>
            </button>
          )}
        </div>

        {authNotice && (
          <div
            role="alert"
            style={{
              marginTop: 10,
              padding: '8px 10px',
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

      {/* 2. GitHub Token Configuration Card */}
      <div className="insight-card" style={{ border: '1px solid var(--border-medium)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div className="insight-title" style={{ color: 'var(--text-primary)', margin: 0 }}>
            <KeyRound size={16} style={{ color: 'var(--accent-cyan)' }} />
            <span>{t('github_token_title', activeLocale)}</span>
          </div>
          <a
            href={GITHUB_NEW_TOKEN_URL}
            target="_blank"
            rel="noreferrer"
            className="btn-github-direct"
            title="GitHub Personal Access Token page"
          >
            <span>{t('btn_create_token', activeLocale)}</span>
            <ExternalLink size={12} />
          </a>
        </div>

        {/* Why add a token alert box */}
        <div className="token-benefit-box">
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
              <HelpCircle size={14} style={{ color: 'var(--accent-cyan)' }} />
              <span>{t('instructions_title', activeLocale)}</span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {showInstructions ? (activeLocale === 'es' ? 'Ocultar ▲' : 'Hide ▲') : (activeLocale === 'es' ? 'Ver ▼' : 'Show ▼')}
            </span>
          </div>

          {showInstructions && (
            <ol className="instructions-steps-list">
              <li>{t('instruction_1', activeLocale)}</li>
              <li>{t('instruction_2', activeLocale)}</li>
              <li>{t('instruction_3', activeLocale)}</li>
              <li>{t('instruction_4', activeLocale)}</li>
              <li>{t('instruction_5', activeLocale)}</li>
              <li>{t('instruction_6', activeLocale)}</li>
            </ol>
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

      {/* 2.5 Code Tree Lateral Dock Settings Card */}
      {(() => {
        const codeTree = preferences.codeTree || DEFAULT_CODE_TREE_PREFERENCES
        return (
          <div
            id="code-tree-settings"
            className="insight-card"
            style={{
              border: '1px solid var(--border-medium)',
              scrollMarginTop: 16,
              transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <FolderTree size={16} style={{ color: 'var(--accent-cyan)' }} />
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                {t('code_tree_settings_title', activeLocale)}
              </span>
            </div>
            <p style={{ margin: '0 0 14px', fontSize: 12, lineHeight: 1.45, color: 'var(--text-secondary)' }}>
              {t('code_tree_settings_desc', activeLocale)}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                  style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent-cyan)' }}
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
                  style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent-cyan)' }}
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
                  style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent-cyan)' }}
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
                          borderColor: isSelected ? 'var(--accent-cyan)' : undefined,
                          background: isSelected ? 'var(--accent-cyan-subtle)' : undefined,
                          color: isSelected ? 'var(--accent-cyan)' : 'var(--text-primary)',
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
                  <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontWeight: 700 }}>
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
                  style={{ width: '100%', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
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
            </div>
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
            style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent-cyan)' }}
          />
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
                borderColor: preferences.theme === key ? 'var(--accent-cyan)' : undefined,
                color: preferences.theme === key ? 'var(--accent-cyan)' : undefined,
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
