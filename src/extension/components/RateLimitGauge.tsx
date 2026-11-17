import { Shield } from 'lucide-react'
import type { ActiveLocale } from '../i18n'

type RateLimitGaugeProps = {
  hasToken?: boolean
  locale?: ActiveLocale
}

export function RateLimitGauge({ hasToken, locale = 'es' }: RateLimitGaugeProps) {
  const isEs = locale === 'es'
  const label = hasToken
    ? isEs
      ? 'Token activo'
      : 'Token ready'
    : isEs
      ? 'Token requerido'
      : 'Token needed'

  const tooltip = hasToken
    ? isEs
      ? 'GitHub Personal Access Token conectado localmente para inspección profunda de repositorios.'
      : 'GitHub Personal Access Token connected locally for deep repository inspection.'
    : isEs
      ? 'Configura tu GitHub Personal Access Token en Ajustes para inspeccionar árboles y dependencias.'
      : 'Configure your GitHub Personal Access Token in Settings to inspect repository trees and dependencies.'

  return (
    <div className="rate-limit-pill" title={tooltip}>
      <Shield size={12} style={{ color: 'var(--text-muted)' }} />
      <span className={`rate-indicator ${hasToken ? 'good' : 'warn'}`} />
      <span>{label}</span>
    </div>
  )
}
