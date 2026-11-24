import { useState, useEffect } from 'react'
import { Sparkles, Zap, ShieldCheck, Bot, AlertCircle } from 'lucide-react'
import { AnalysisMascot } from './AnalysisMascot'
import {
  signInWithGitHub,
  getAuthSession,
  subscribeToAuthSession,
  type AuthSession,
} from '../auth/supabaseAuth'
import { t, type ActiveLocale } from '../i18n'

export interface GitHubLoginGateCardProps {
  locale?: ActiveLocale
  repoName?: string
  onLoggedIn?: (session: AuthSession) => void
  onDismiss?: () => void
}

export function GitHubLoginGateCard({
  locale = 'es',
  repoName,
  onLoggedIn,
  onDismiss,
}: GitHubLoginGateCardProps) {
  const isEs = locale === 'es'
  const [authBusy, setAuthBusy] = useState(false)
  const [authNotice, setAuthNotice] = useState<string | null>(null)

  // Immediately detect GitHub OAuth completion as soon as authorization succeeds
  useEffect(() => {
    let mounted = true
    void getAuthSession().then((existing) => {
      if (mounted && existing?.user?.id) {
        onLoggedIn?.(existing)
      }
    }).catch(() => {})

    const unsubscribe = subscribeToAuthSession((session) => {
      if (mounted && session?.user?.id) {
        onLoggedIn?.(session)
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [onLoggedIn])

  const handleSignIn = async () => {
    setAuthNotice(null)
    setAuthBusy(true)
    try {
      const session = await signInWithGitHub()
      if (!session) {
        // Re-check storage in case session arrived via external callback or identity window
        const stored = await getAuthSession().catch(() => null)
        if (stored?.user?.id) {
          onLoggedIn?.(stored)
          return
        }
        setAuthNotice(t('auth_cancelled_notice', locale))
      } else {
        onLoggedIn?.(session)
      }
    } catch (err) {
      const stored = await getAuthSession().catch(() => null)
      if (stored?.user?.id) {
        onLoggedIn?.(stored)
        return
      }
      setAuthNotice(
        err instanceof Error && err.message
          ? err.message
          : t('auth_cancelled_notice', locale)
      )
    } finally {
      setAuthBusy(false)
    }
  }

  return (
    <div
      className="quota-paywall-card guest-gate-card animate-fade-in"
      role="alert"
      style={{
        border: '1px solid var(--border-medium, #30363d)',
        background: 'var(--bg-card, #161b22)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.28), 0 0 12px rgba(56, 189, 248, 0.08)',
      }}
    >
      <div className="quota-paywall-header">
        <AnalysisMascot moodOverride="sparkle" size={72} />
        <div
          className="quota-paywall-badge"
          style={{
            color: 'var(--brand-primary, #38bdf8)',
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
          }}
        >
          <Sparkles size={12} style={{ color: 'var(--brand-primary, #38bdf8)' }} />
          <span>{t('guest_gate_badge', locale)}</span>
        </div>
      </div>

      <div className="quota-paywall-content">
        <h3 className="quota-paywall-title" style={{ fontSize: 16 }}>
          {t('guest_gate_title', locale)}
        </h3>

        <p className="quota-paywall-desc">
          {repoName ? (
            <span>
              {isEs ? 'Para continuar analizando ' : 'To keep analyzing '}
              <strong style={{ color: 'var(--text-primary)' }}>{repoName}</strong>
              {isEs
                ? ', conecta tu cuenta oficial de GitHub en 1 clic. Conectar tu cuenta es 100% gratis, elimina las restricciones anónimas de GitHub y desbloquea el análisis continuo.'
                : ', connect your official GitHub account with 1 click. Connecting is 100% free, removes anonymous GitHub limits, and unlocks continuous analysis.'}
            </span>
          ) : (
            t('guest_gate_desc', locale)
          )}
        </p>

        <div className="quota-features-grid">
          <div className="quota-feature-item">
            <Zap size={14} style={{ color: 'var(--accent-amber, #f59e0b)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>{t('guest_gate_feat_rate_limit_title', locale)}</strong>
              <span>{t('guest_gate_feat_rate_limit_desc', locale)}</span>
            </div>
          </div>

          <div className="quota-feature-item">
            <Bot size={14} style={{ color: 'var(--brand-primary, #38bdf8)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>{t('guest_gate_feat_ai_title', locale)}</strong>
              <span>{t('guest_gate_feat_ai_desc', locale)}</span>
            </div>
          </div>

          <div className="quota-feature-item">
            <ShieldCheck size={14} style={{ color: 'var(--accent-emerald, #10b981)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>{t('guest_gate_feat_privacy_title', locale)}</strong>
              <span>{t('guest_gate_feat_privacy_desc', locale)}</span>
            </div>
          </div>
        </div>

        <div className="quota-paywall-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleSignIn()}
            disabled={authBusy}
            style={{
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 700,
              gap: 8,
              justifyContent: 'center',
            }}
          >
            {authBusy ? (
              <span className="animate-spin" style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%' }} />
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
            )}
            <span>{t('guest_gate_btn', locale)}</span>
          </button>

          {onDismiss && (
            <button
              type="button"
              className="btn-secondary"
              onClick={onDismiss}
              style={{ padding: '7px 12px', fontSize: 11.5 }}
            >
              {isEs ? 'Explorar configuración' : 'Explore settings'}
            </button>
          )}

          <span style={{ fontSize: 10.5, color: 'var(--text-muted, #8b949e)', marginTop: 4 }}>
            {t('guest_gate_secure_note', locale)}
          </span>
        </div>

        {authNotice && (
          <div
            role="alert"
            style={{
              marginTop: 10,
              padding: '7px 10px',
              borderRadius: 'var(--radius-sm, 6px)',
              fontSize: 11.5,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              background: 'rgba(245, 158, 11, 0.1)',
              color: 'var(--accent-amber, #f59e0b)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              width: '100%',
              textAlign: 'left',
            }}
          >
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <span>{authNotice}</span>
          </div>
        )}
      </div>
    </div>
  )
}
