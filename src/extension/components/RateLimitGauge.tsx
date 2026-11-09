import { Shield } from 'lucide-react'

type RateLimitGaugeProps = {
  remaining: number | null
  resetAt: string | null
  hasToken?: boolean
}

export function RateLimitGauge({ remaining, resetAt, hasToken }: RateLimitGaugeProps) {
  const max = hasToken ? 5000 : 60
  const count = remaining !== null ? remaining : max
  const ratio = count / max

  let statusClass = 'good'
  if (ratio < 0.2) statusClass = 'low'
  else if (ratio < 0.5) statusClass = 'warn'

  let resetLabel = ''
  if (resetAt) {
    try {
      const date = new Date(resetAt)
      resetLabel = `Reinicia a las ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    } catch {
      // ignore
    }
  }

  return (
    <div
      className="rate-limit-pill"
      title={`GitHub API: ${count} de ${max} peticiones disponibles${resetLabel ? ` (${resetLabel})` : ''}${hasToken ? ' [Token activo]' : ' [Sin token: límite de 60/h]'}`}
    >
      <Shield size={12} style={{ color: 'var(--text-muted)' }} />
      <span className={`rate-indicator ${statusClass}`} />
      <span>
        {remaining !== null ? remaining : '--'}/{max}
      </span>
    </div>
  )
}
