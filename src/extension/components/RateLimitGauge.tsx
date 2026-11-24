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
      ? 'Conectado'
      : 'Connected'
    : isEs
      ? 'Modo invitado'
      : 'Guest mode'

  const tooltip = hasToken
    ? isEs
      ? 'Cuenta de GitHub conectada y activa para inspección de repositorios.'
      : 'GitHub account connected and active for repository inspection.'
    : isEs
      ? 'Modo invitado activo. Conecta tu cuenta oficial de GitHub para continuar sin límites de prueba.'
      : 'Guest mode active. Connect your official GitHub account to continue beyond trial limits.'

  return (
    <div className="rate-limit-pill" title={tooltip}>
      <Shield size={12} style={{ color: 'var(--text-muted)' }} />
      <span className={`rate-indicator ${hasToken ? 'good' : 'warn'}`} />
      <span>{label}</span>
    </div>
  )
}
