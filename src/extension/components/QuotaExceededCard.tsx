import { useState } from 'react'
import { Sparkles, RefreshCw, Zap, Layers, ShieldCheck, MessageSquare } from 'lucide-react'
import { AnalysisMascot } from './AnalysisMascot'
import { initiateProUpgrade, refreshProStatus } from '../auth/supabaseAuth'
import { clearDailyQuotaExceeded } from '../api/backendClient'
import { t, type ActiveLocale } from '../i18n'

interface Props {
  locale?: ActiveLocale
  repoName?: string
  onProVerified?: () => void
  onDismiss?: () => void
}

export function QuotaExceededCard({
  locale = 'es',
  repoName,
  onProVerified,
}: Props) {
  const isEs = locale === 'es'
  const [upgrading, setUpgrading] = useState(false)
  const [upgradeNotice, setUpgradeNotice] = useState<string | null>(null)

  const handleUpgrade = async () => {
    setUpgrading(true)
    setUpgradeNotice(null)
    try {
      const session = await initiateProUpgrade()
      if (session?.isPro) {
        await clearDailyQuotaExceeded()
        onProVerified?.()
      } else {
        setUpgradeNotice(t('upgrade_cancelled_notice', locale))
      }
    } catch (err) {
      setUpgradeNotice(
        err instanceof Error && err.message
          ? err.message
          : t('upgrade_cancelled_notice', locale)
      )
    } finally {
      setUpgrading(false)
    }
  }

  const handleVerifyPro = async () => {
    setUpgrading(true)
    setUpgradeNotice(null)
    try {
      const session = await refreshProStatus()
      if (session?.isPro) {
        await clearDailyQuotaExceeded()
        onProVerified?.()
      } else {
        setUpgradeNotice(
          isEs
            ? 'Aún no se detecta una suscripción Pro activa. Si acabas de pagar, reintenta en unos segundos.'
            : 'No active Pro subscription detected yet. If you just upgraded, retry in a few seconds.'
        )
      }
    } catch {
      setUpgradeNotice(
        isEs
          ? 'Error al verificar la suscripción. Intenta nuevamente.'
          : 'Failed to verify subscription. Please try again.'
      )
    } finally {
      setUpgrading(false)
    }
  }

  return (
    <div className="quota-paywall-card animate-fade-in" role="alert">
      <div className="quota-paywall-header">
        <AnalysisMascot moodOverride="worried" size={72} />
        <div className="quota-paywall-badge">
          <Zap size={12} style={{ color: 'var(--accent-amber)' }} />
          <span>{isEs ? 'LÍMITE DIARIO GRATUITO ALCANZADO' : 'DAILY FREE LIMIT REACHED'}</span>
        </div>
      </div>

      <div className="quota-paywall-content">
        <h3 className="quota-paywall-title">
          {isEs
            ? 'Has alcanzado el máximo de solicitudes gratuitas'
            : 'You have reached today’s free request limit'}
        </h3>
        <p className="quota-paywall-desc">
          {repoName ? (
            <span>
              {isEs
                ? `Para analizar `
                : `To analyze `}
              <strong style={{ color: 'var(--text-primary)' }}>{repoName}</strong>
              {isEs
                ? `, necesitas una cuenta Pro. Has agotado tus consultas gratuitas de hoy. El cupo gratuito se reinicia a las 00:00 UTC, o puedes actualizar a Pro para obtener análisis ilimitados inmediatos.`
                : `, a Pro subscription is required. You have reached your free daily quota. Free quota resets at 00:00 UTC, or upgrade to Pro for unlimited immediate analyses.`}
            </span>
          ) : (
            isEs
              ? 'Has utilizado todas tus consultas gratuitas de hoy. Para proteger los recursos de la API y garantizar la calidad del servicio, el cupo gratuito se reinicia a las 00:00 UTC. Actualiza a Pro para disfrutar de análisis ilimitados.'
              : 'You have used all of your free requests for today. To protect API resources and ensure quality of service, free quotas reset at 00:00 UTC. Upgrade to Pro for unlimited analyses.'
          )}
        </p>

        <div className="quota-features-grid">
          <div className="quota-feature-item">
            <Sparkles size={14} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
            <div>
              <strong>{isEs ? 'Análisis Ilimitados' : 'Unlimited Analyses'}</strong>
              <span>{isEs ? 'Sin límites diarios en ningún repositorio' : 'No daily caps on any public repository'}</span>
            </div>
          </div>

          <div className="quota-feature-item">
            <Layers size={14} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
            <div>
              <strong>{isEs ? 'Diagramas de Arquitectura' : 'Architecture Diagrams'}</strong>
              <span>{isEs ? 'Generación visual con Mermaid.js' : 'Full visual dataflow with Mermaid.js'}</span>
            </div>
          </div>

          <div className="quota-feature-item">
            <ShieldCheck size={14} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />
            <div>
              <strong>{isEs ? 'Auditoría Profunda' : 'Deep Audit'}</strong>
              <span>{isEs ? 'Fortalezas y puntos críticos de seguridad' : 'Strengths and security vulnerability review'}</span>
            </div>
          </div>

          <div className="quota-feature-item">
            <MessageSquare size={14} style={{ color: 'var(--accent-purple)', flexShrink: 0 }} />
            <div>
              <strong>{isEs ? 'Mascota IA Interactiva' : 'Interactive AI Mascot'}</strong>
              <span>{isEs ? 'Chat contextual para consultar dudas' : 'Context-aware chat to ask any question'}</span>
            </div>
          </div>
        </div>

        <div className="quota-paywall-actions">
          <button
            type="button"
            className="btn-github-direct"
            onClick={() => void handleUpgrade()}
            disabled={upgrading}
            style={{ width: '100%', justifyContent: 'center', padding: '10px 14px', fontSize: 13 }}
          >
            <Sparkles size={14} />
            <span>{isEs ? 'Actualizar a Pro — Análisis Ilimitados ($4.99)' : 'Upgrade to Pro — Unlimited Access ($4.99)'}</span>
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => void handleVerifyPro()}
            disabled={upgrading}
            style={{ width: '100%', justifyContent: 'center', padding: '8px 12px', fontSize: 12 }}
          >
            <RefreshCw size={12} className={upgrading ? 'animate-spin' : ''} />
            <span>{isEs ? '¿Ya compraste? Verificar suscripción' : 'Already upgraded? Check subscription'}</span>
          </button>

          {upgradeNotice && (
            <p className="quota-paywall-notice">
              {upgradeNotice}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
