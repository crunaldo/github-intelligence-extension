import { KeyRound, RefreshCw, ExternalLink, Lightbulb, X } from 'lucide-react'
import type { ActiveLocale } from '../i18n'
import { AnalysisMascot } from './AnalysisMascot'

type ApiErrorCardProps = {
  error: string | Error | null
  locale?: ActiveLocale
  onOpenSettings?: () => void
  onRetry?: () => void
  onDismiss?: () => void
}

type ParsedErrorInfo = {
  isRateLimit: boolean
  isBadCredentials: boolean
  isNotFound: boolean
  title: string
  description: string
  recommendation?: string
  actionLabel?: string
  rawMessage: string
}

export function parseAndTranslateError(
  error: string | Error | null,
  locale: ActiveLocale = 'es'
): ParsedErrorInfo | null {
  if (!error) return null

  const isEs = locale === 'es'
  const rawMessage = typeof error === 'string' ? error : error.message || String(error)
  const lower = rawMessage.toLowerCase()

  // 1. Rate Limit Exceeded
  if (
    lower.includes('rate limit exceeded') ||
    lower.includes('rate limit') ||
    lower.includes('higher rate limit') ||
    lower.includes('secondary rate limit')
  ) {
    return {
      isRateLimit: true,
      isBadCredentials: false,
      isNotFound: false,
      title: isEs ? 'Token de GitHub Requerido para Continuar' : 'GitHub Token Required to Continue',
      description: isEs
        ? 'GitHub requiere un token personal de acceso para inspeccionar de forma continua árboles de código, manifiestos y metadatos del repositorio.'
        : 'GitHub requires a personal access token to inspect repository code trees, manifests, and metadata uninterrupted.',
      recommendation: isEs
        ? 'Añade tu GitHub Personal Access Token gratuito (solo lectura) en los ajustes; se guarda 100% en local y habilita el análisis sin interrupciones.'
        : 'Add your free read-only GitHub Personal Access Token in settings; it is stored 100% locally and enables uninterrupted repository analysis.',
      actionLabel: isEs ? 'Ir a Ajustes para añadir Token' : 'Go to Settings to add Token',
      rawMessage,
    }
  }

  // 2. Bad Credentials / Invalid Token
  if (lower.includes('bad credentials') || lower.includes('token expired') || lower.includes('unauthorized') || lower.includes('401')) {
    return {
      isRateLimit: false,
      isBadCredentials: true,
      isNotFound: false,
      title: isEs ? 'Token de GitHub no Válido o Expirado' : 'Invalid or Expired GitHub Token',
      description: isEs
        ? 'GitHub no pudo validar tu token guardado. Puede haber sido revocado o haber caducado.'
        : 'GitHub could not validate your saved token. It may have expired or been revoked.',
      recommendation: isEs
        ? 'Abre los ajustes para ingresar un token vigente con permisos de lectura pública (public_repo).'
        : 'Open settings to provide a valid token with public_repo read permissions.',
      actionLabel: isEs ? 'Ir a Ajustes para actualizar Token' : 'Go to Settings to update Token',
      rawMessage,
    }
  }

  // 3. Not Found (404)
  if (lower.includes('not found') || lower.includes('404')) {
    return {
      isRateLimit: false,
      isBadCredentials: false,
      isNotFound: true,
      title: isEs ? 'Repositorio no Encontrado o Inaccesible' : 'Repository Not Found or Inaccessible',
      description: isEs
        ? 'GitHub no pudo localizar este repositorio público. Puede no existir, haber cambiado de nombre o no estar disponible.'
        : 'GitHub could not locate this public repository. It may not exist, was renamed, or is unavailable.',
      recommendation: isEs
        ? 'Verifica la URL o configura tu GitHub Token con alcance "public_repo" en los Ajustes para habilitar la inspección de metadatos y árboles.'
        : 'Verify the repository URL or configure your GitHub Token with "public_repo" scope in Settings to enable tree and metadata inspection.',
      actionLabel: isEs ? 'Configurar Token en Ajustes' : 'Configure Token in Settings',
      rawMessage,
    }
  }

  // 4. Network / Connection Error
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('conexión')) {
    return {
      isRateLimit: false,
      isBadCredentials: false,
      isNotFound: false,
      title: isEs ? 'Error de Conexión con GitHub' : 'GitHub Connection Error',
      description: isEs
        ? 'No se pudo establecer conexión con los servidores de GitHub. Comprueba tu conexión a internet.'
        : 'Could not connect to GitHub servers. Please check your internet connection.',
      recommendation: isEs
        ? 'Verifica que el servicio de internet esté activo y reintenta el análisis.'
        : 'Ensure your network is active and retry the analysis.',
      actionLabel: undefined,
      rawMessage,
    }
  }

  // 5. Default Error
  return {
    isRateLimit: false,
    isBadCredentials: false,
    isNotFound: false,
    title: isEs ? 'Error al Analizar el Repositorio' : 'Repository Analysis Error',
    description: rawMessage,
    recommendation: isEs
      ? 'Intenta recargar el análisis o verifica que la URL del repositorio sea correcta.'
      : 'Try reloading the analysis or verify the repository URL.',
    actionLabel: undefined,
    rawMessage,
  }
}

export function ApiErrorCard({
  error,
  locale = 'es',
  onOpenSettings,
  onRetry,
  onDismiss,
}: ApiErrorCardProps) {
  const parsed = parseAndTranslateError(error, locale)
  if (!parsed) return null

  const isEs = locale === 'es'
  const isHighPriority = parsed.isRateLimit || parsed.isBadCredentials

  return (
    <div
      className="api-error-card animate-fade-in"
      style={{
        padding: '12px 14px',
        borderRadius: 'var(--radius-md)',
        background: isHighPriority ? 'rgba(245, 158, 11, 0.08)' : 'rgba(244, 63, 94, 0.08)',
        border: `1px solid ${isHighPriority ? 'rgba(245, 158, 11, 0.35)' : 'rgba(244, 63, 94, 0.3)'}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        marginBottom: 12,
      }}
    >
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AnalysisMascot
            moodOverride={parsed.isRateLimit ? 'warning' : 'error'}
            size={42}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                fontWeight: 800,
                fontSize: 12.5,
                color: isHighPriority ? 'var(--accent-amber)' : 'var(--brand-primary)',
              }}
            >
              {parsed.title}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {parsed.isRateLimit
                ? (isEs ? 'Límite de solicitudes alcanzado' : 'Rate limit reached')
                : (isEs ? 'Revisa la consulta o tu conexión' : 'Please verify query or connection')}
            </span>
          </div>
        </div>

        {onDismiss && (
          <button
            type="button"
            className="ext-btn-icon"
            onClick={onDismiss}
            title={isEs ? 'Cerrar alerta' : 'Dismiss alert'}
            style={{ padding: 2 }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Main Translated Description */}
      <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-primary)', lineHeight: 1.5 }}>
        {parsed.description}
      </p>

      {/* Recommendation Box */}
      {parsed.recommendation && (
        <div
          style={{
            padding: '8px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 7,
          }}
        >
          <Lightbulb size={14} style={{ color: 'var(--accent-amber)', flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            <strong style={{ color: 'var(--text-primary)' }}>{isEs ? 'Recomendación: ' : 'Recommendation: '}</strong>
            {parsed.recommendation}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 2 }}>
        {parsed.actionLabel && onOpenSettings && (
          <button
            type="button"
            className="api-error-settings-btn"
            onClick={onOpenSettings}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              background: '#238636',
              border: '1px solid rgba(240, 246, 252, 0.1)',
              color: '#ffffff',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#2ea043')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = '#238636')}
          >
            <KeyRound size={13} />
            <span>{parsed.actionLabel}</span>
          </button>
        )}

        {onRetry && (
          <button
            type="button"
            className="api-error-retry-btn"
            onClick={onRetry}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-medium)',
              color: 'var(--text-primary)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={12} />
            <span>{isEs ? 'Reintentar' : 'Retry'}</span>
          </button>
        )}

        {parsed.isRateLimit && (
          <a
            href="https://github.com/settings/tokens/new?scopes=public_repo&description=GitHub%20Project%20Intelligence%20Assistant"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10.5,
              color: 'var(--text-muted)',
              textDecoration: 'none',
              marginLeft: 'auto',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
          >
            <span>{isEs ? 'Crear token en GitHub (gratis)' : 'Create free token in GitHub'}</span>
            <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  )
}
