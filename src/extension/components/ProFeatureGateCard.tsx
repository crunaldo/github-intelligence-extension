import { useState } from 'react'
import { Lock, Sparkles, RefreshCw } from 'lucide-react'
import { initiateProUpgrade, refreshProStatus, type AuthSession } from '../auth/supabaseAuth'
import { t, type ActiveLocale } from '../i18n'

export interface ProFeatureGateCardProps {
  moduleName: string
  description?: string
  locale?: ActiveLocale
  onUpgraded?: (session: AuthSession | null) => void
}

export function ProFeatureGateCard({
  moduleName,
  description,
  locale = 'es',
  onUpgraded,
}: ProFeatureGateCardProps) {
  const isEs = locale === 'es'
  const [upgrading, setUpgrading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const handleUpgrade = async () => {
    setNotice(null)
    setUpgrading(true)
    try {
      const upgradedSession = await initiateProUpgrade()
      if (!upgradedSession) {
        setNotice(t('upgrade_cancelled_notice', locale))
      } else {
        onUpgraded?.(upgradedSession)
      }
    } catch (err) {
      setNotice(
        err instanceof Error && err.message ? err.message : t('upgrade_cancelled_notice', locale)
      )
    } finally {
      setUpgrading(false)
    }
  }

  const handleRefresh = async () => {
    setNotice(null)
    setUpgrading(true)
    try {
      const refreshed = await refreshProStatus()
      if (!refreshed?.isPro) {
        setNotice(
          isEs
            ? 'Aún no se detecta suscripción activa. Si acabas de pagar, reintenta en unos segundos.'
            : 'No active Pro subscription detected yet. If you just completed checkout, retry in a few seconds.'
        )
      } else {
        onUpgraded?.(refreshed)
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t('ai_error_notice', locale))
    } finally {
      setUpgrading(false)
    }
  }

  return (
    <div
      className="architecture-diagram-card animate-fade-in"
      style={{
        border: '1px solid rgba(56, 189, 248, 0.35)',
        background:
          'linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)',
        borderRadius: 'var(--radius-md, 8px)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontWeight: 700,
            fontSize: 13,
            color: 'var(--text-primary)',
          }}
        >
          <Lock size={14} style={{ color: 'var(--accent-cyan)' }} />
          <span>{moduleName}</span>
        </div>
        <span
          className="colloquial-chip"
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: 'var(--accent-cyan)',
            letterSpacing: '0.05em',
          }}
        >
          PRO
        </span>
      </div>

      <p
        style={{
          margin: '2px 0 6px',
          fontSize: 12,
          color: 'var(--text-secondary)',
          lineHeight: 1.45,
        }}
      >
        {description ||
          (isEs
            ? `El módulo "${moduleName}" es una funcionalidad avanzada exclusiva para usuarios Pro. Suscríbete para desbloquear el análisis completo sin restricciones.`
            : `The "${moduleName}" module is an advanced feature reserved for Pro subscribers. Upgrade now to unlock full repository intelligence.`)}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
        <button
          type="button"
          className="btn-github-direct"
          onClick={() => void handleUpgrade()}
          disabled={upgrading}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          <Sparkles size={13} />
          <span>{t('upgrade_to_pro_btn', locale)}</span>
        </button>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => void handleRefresh()}
          disabled={upgrading}
          style={{
            width: '100%',
            justifyContent: 'center',
            fontSize: 11.5,
            padding: '4px 8px',
          }}
        >
          <RefreshCw size={11} className={upgrading ? 'animate-spin' : ''} />
          <span>
            {isEs ? '¿Ya te suscribiste? Actualizar estado' : 'Already upgraded? Refresh status'}
          </span>
        </button>
      </div>

      {notice && (
        <p
          style={{
            margin: '4px 0 0',
            fontSize: 11,
            color: 'var(--accent-amber)',
            lineHeight: 1.35,
          }}
        >
          {notice}
        </p>
      )}
    </div>
  )
}
