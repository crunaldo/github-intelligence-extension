import { useEffect, useId, useRef, useState } from 'react'
import mermaid from 'mermaid'
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Layers,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react'
import type { RepositoryReport } from '../../features/repository/types'
import {
  fetchRemoteConfig,
  fetchRepoIntelligence,
  sanitizeCommitRef,
  type FilteredAnalysisResult,
} from '../api/backendClient'
import {
  getAuthSession,
  initiateProUpgrade,
  refreshProStatus,
  type AuthSession,
} from '../auth/supabaseAuth'
import { t, type ActiveLocale } from '../i18n'
import { classifySummaryError } from '../spanishSummary'

type ArchitectureDiagramViewProps = {
  report: RepositoryReport
  locale?: ActiveLocale
  diagramsEnabled?: boolean
}

let mermaidInitialized = false

function ensureMermaidInitialized() {
  if (mermaidInitialized) return
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'strict',
  })
  mermaidInitialized = true
}

export function ArchitectureDiagramView({
  report,
  locale = 'es',
  diagramsEnabled,
}: ArchitectureDiagramViewProps) {
  const isEs = locale === 'es'
  const renderSeed = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const svgContainerRef = useRef<HTMLDivElement | null>(null)

  const [analysis, setAnalysis] = useState<FilteredAnalysisResult | null>(null)
  const [session, setSession] = useState<AuthSession | null>(null)
  const [remoteDiagramsEnabled, setRemoteDiagramsEnabled] = useState<boolean>(
    diagramsEnabled ?? true
  )
  const [loading, setLoading] = useState(true)
  const [quotaExceeded, setQuotaExceeded] = useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [copiedMermaid, setCopiedMermaid] = useState(false)
  const [viewMode, setViewMode] = useState<'diagram' | 'code'>('diagram')
  const [renderFailed, setRenderFailed] = useState(false)
  const [upgrading, setUpgrading] = useState(false)
  const [upgradeNotice, setUpgradeNotice] = useState<string | null>(null)
  const [retryTick, setRetryTick] = useState(0)
  const [forceNextFetch, setForceNextFetch] = useState(false)

  useEffect(() => {
    if (typeof diagramsEnabled === 'boolean') {
      setRemoteDiagramsEnabled(diagramsEnabled)
    }
  }, [diagramsEnabled])

  useEffect(() => {
    let cancelled = false
    const owner = report.repository?.owner || report.target?.owner
    const repo = report.repository?.name || report.target?.repository
    const commitSha = sanitizeCommitRef(
      report.latestCommit?.sha || report.resolvedRef || report.repository?.defaultBranch
    )

    if (!owner || !repo) {
      setAnalysis(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setQuotaExceeded(false)
    setMaintenanceMessage(null)
    setErrorMessage(null)

    const shouldForce = forceNextFetch
    if (shouldForce) {
      setForceNextFetch(false)
    }

    void Promise.all([
      fetchRepoIntelligence(owner, repo, commitSha, shouldForce ? { forceRefresh: true } : undefined),
      getAuthSession(),
      typeof diagramsEnabled === 'boolean'
        ? Promise.resolve(null)
        : fetchRemoteConfig().catch(() => null),
    ])
      .then(([intel, currentSession, remoteConfig]) => {
        if (cancelled) return
        setAnalysis(intel)
        setSession(currentSession)
        if (remoteConfig) {
          setRemoteDiagramsEnabled(remoteConfig.featureFlags.enableDiagrams)
        }
        setLoading(false)
      })
      .catch(async (err: unknown) => {
        if (cancelled) return
        const currentSession = await getAuthSession().catch(() => null)
        if (cancelled) return
        setSession(currentSession)
        const state = classifySummaryError(err)
        setQuotaExceeded(state.quotaExceeded)
        setMaintenanceMessage(state.maintenanceMode ? state.errorMessage : null)
        setErrorMessage(state.maintenanceMode ? null : state.errorMessage)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [report, retryTick, diagramsEnabled])

  const diagramCode = analysis?.architectureDiagram?.trim() || ''

  useEffect(() => {
    if (!diagramCode || viewMode !== 'diagram') {
      setRenderFailed(false)
      return
    }

    let cancelled = false
    setRenderFailed(false)

    async function renderMermaidSvg() {
      try {
        ensureMermaidInitialized()
        const diagramId = `gpi-mermaid-${renderSeed}-${Date.now()}`
        const { svg } = await mermaid.render(diagramId, diagramCode)
        if (cancelled || !svgContainerRef.current) return

        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
        const parserError = doc.querySelector('parsererror')
        const svgElement = doc.documentElement
        if (parserError || !svgElement || svgElement.tagName.toLowerCase() !== 'svg') {
          setRenderFailed(true)
          return
        }

        svgContainerRef.current.replaceChildren(document.importNode(svgElement, true))
      } catch {
        if (!cancelled) {
          setRenderFailed(true)
        }
      }
    }

    void renderMermaidSvg()
    return () => {
      cancelled = true
    }
  }, [diagramCode, viewMode, renderSeed])

  const handleCopyCode = async () => {
    if (!diagramCode) return
    try {
      await navigator.clipboard.writeText(diagramCode)
      setCopiedMermaid(true)
      setTimeout(() => setCopiedMermaid(false), 2000)
    } catch {
      // Ignore clipboard permission errors
    }
  }

  const handleUpgrade = async () => {
    setUpgradeNotice(null)
    setUpgrading(true)
    try {
      const upgradedSession = await initiateProUpgrade()
      if (!upgradedSession) {
        setUpgradeNotice(t('upgrade_cancelled_notice', locale))
      } else {
        setSession(upgradedSession)
      }
    } catch (err) {
      setUpgradeNotice(
        err instanceof Error && err.message ? err.message : t('upgrade_cancelled_notice', locale)
      )
    } finally {
      setUpgrading(false)
    }
  }

  const handleRefreshPro = async () => {
    setUpgradeNotice(null)
    setUpgrading(true)
    try {
      const refreshed = await refreshProStatus()
      setSession(refreshed)
      if (!refreshed?.isPro) {
        setUpgradeNotice(
          isEs
            ? 'Aún no se detecta una suscripción Pro activa. Si acabas de pagar, reintenta en unos segundos.'
            : 'No active Pro subscription detected yet. If you just completed checkout, retry in a few seconds.'
        )
        return
      }
      setForceNextFetch(true)
      setRetryTick((n) => n + 1)
    } catch (err) {
      setUpgradeNotice(
        err instanceof Error && err.message ? err.message : t('ai_error_notice', locale)
      )
    } finally {
      setUpgrading(false)
    }
  }

  if (loading) {
    return (
      <div className="architecture-diagram-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
          <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--accent-cyan)' }} />
          <span>
            {isEs
              ? 'Cargando arquitectura y auditoría técnica...'
              : 'Loading AI architecture diagram & deep audit...'}
          </span>
        </div>
      </div>
    )
  }

  if (maintenanceMessage) {
    return (
      <div className="architecture-diagram-card">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
          <Wrench size={15} style={{ color: 'var(--accent-rose)', flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: 2 }}>
              {t('maintenance_title', locale)}
            </strong>
            <span>{maintenanceMessage}</span>
          </div>
        </div>
      </div>
    )
  }

  if (quotaExceeded) {
    return (
      <div className="architecture-diagram-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }}>
          <Sparkles size={15} style={{ color: 'var(--accent-cyan)' }} />
          <span>{t('quota_exceeded_title', locale)}</span>
        </div>
        <p style={{ margin: '6px 0 10px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
          {t('quota_exceeded_desc', locale)}
        </p>
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
        {upgradeNotice && (
          <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--accent-amber)' }}>
            {upgradeNotice}
          </p>
        )}
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="architecture-diagram-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
          <AlertCircle size={15} style={{ color: 'var(--accent-amber)', flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setRetryTick((n) => n + 1)}
          style={{ padding: '4px 8px', fontSize: 11, flexShrink: 0 }}
        >
          <RefreshCw size={11} />
          <span>{t('retry_btn', locale)}</span>
        </button>
      </div>
    )
  }

  const deepAudit = analysis?.deepAudit
  const hasDeepAudit =
    Boolean(deepAudit) &&
    ((deepAudit?.strengths?.length ?? 0) > 0 || (deepAudit?.concerns?.length ?? 0) > 0)
  const isProDiagramsDisabled = !diagramCode && (!remoteDiagramsEnabled && (Boolean(session?.isPro) || hasDeepAudit))

  if (!diagramCode && !isProDiagramsDisabled) {
    return (
      <div
        className="architecture-diagram-card"
        style={{
          border: '1px solid rgba(56, 189, 248, 0.35)',
          background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
            <Lock size={14} style={{ color: 'var(--accent-cyan)' }} />
            <span>{t('pro_arch_locked_title', locale)}</span>
          </div>
          <span className="colloquial-chip" style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-cyan)' }}>
            PRO
          </span>
        </div>

        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {t('pro_arch_locked_desc', locale)}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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

          {session?.user && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void handleRefreshPro()}
              disabled={upgrading}
              style={{ width: '100%', justifyContent: 'center', fontSize: 11.5 }}
            >
              <RefreshCw size={12} className={upgrading ? 'animate-spin' : ''} />
              <span>
                {isEs ? '¿Ya mejoraste a Pro? Actualizar estado' : 'Already upgraded? Refresh Pro status'}
              </span>
            </button>
          )}
        </div>

        {upgradeNotice && (
          <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--accent-amber)', lineHeight: 1.4 }}>
            {upgradeNotice}
          </p>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="architecture-diagram-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={15} style={{ color: 'var(--brand-primary)' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {isEs ? 'Diagrama de Arquitectura (IA)' : 'AI Architecture Diagram'}
            </span>
          </div>

          {diagramCode && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className={`btn-secondary ${viewMode === 'diagram' ? 'active' : ''}`}
                onClick={() => setViewMode('diagram')}
                style={{ padding: '4px 8px', fontSize: 11 }}
              >
                <Layers size={11} />
                <span>{isEs ? 'Visual' : 'Visual'}</span>
              </button>
              <button
                type="button"
                className={`btn-secondary ${viewMode === 'code' ? 'active' : ''}`}
                onClick={() => setViewMode('code')}
                style={{ padding: '4px 8px', fontSize: 11 }}
              >
                <Code2 size={11} />
                <span>Mermaid</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void handleCopyCode()}
                title={isEs ? 'Copiar código Mermaid' : 'Copy Mermaid code'}
                style={{ padding: '4px 8px', fontSize: 11 }}
              >
                {copiedMermaid ? <Check size={11} style={{ color: 'var(--accent-emerald)' }} /> : <Copy size={11} />}
                <span>{copiedMermaid ? (isEs ? 'Copiado' : 'Copied') : (isEs ? 'Copiar' : 'Copy')}</span>
              </button>
            </div>
          )}
        </div>

        {isProDiagramsDisabled ? (
          <div
            style={{
              padding: 12,
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              fontSize: 12,
              color: 'var(--text-secondary)',
            }}
          >
            {t('pro_diagrams_disabled_notice', locale)}
          </div>
        ) : viewMode === 'diagram' && !renderFailed ? (
          <div className="diagram-canvas-box" style={{ padding: 10, overflowX: 'auto' }}>
            <div ref={svgContainerRef} className="mermaid-rendered-svg" style={{ width: '100%' }} />
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            {renderFailed && viewMode === 'diagram' && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                {isEs
                  ? 'Mostrando fuente Mermaid del análisis Pro:'
                  : 'Showing Pro Mermaid diagram source:'}
              </div>
            )}
            <pre
              style={{
                margin: 0,
                padding: 12,
                borderRadius: 'var(--radius-sm)',
                background: '#0a0d12',
                color: '#7dd3fc',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                lineHeight: 1.5,
                overflowX: 'auto',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {diagramCode}
            </pre>
          </div>
        )}

        {diagramCode && (
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5, color: 'var(--text-muted)' }}>
            <span>{isEs ? 'Generado por IA con Mermaid' : 'AI-generated Mermaid diagram'}</span>
            <span>{isEs ? 'Compatible con Notion y GitHub' : 'Compatible with Notion & GitHub'}</span>
          </div>
        )}
      </div>

      {hasDeepAudit && deepAudit && (
        <div className="architecture-diagram-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={15} style={{ color: 'var(--accent-emerald)' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {isEs ? 'Auditoría Técnica Profunda' : 'Deep Technical Audit'}
            </span>
          </div>

          {deepAudit.strengths.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-emerald)', textTransform: 'uppercase' }}>
                {isEs ? 'Fortalezas' : 'Strengths'}
              </div>
              {deepAudit.strengths.map((item, idx) => (
                <div
                  key={`strength-${idx}`}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.45 }}
                >
                  <CheckCircle2 size={13} style={{ color: 'var(--accent-emerald)', flexShrink: 0, marginTop: 2 }} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}

          {deepAudit.concerns.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-amber)', textTransform: 'uppercase' }}>
                {isEs ? 'Riesgos & Puntos de Atención' : 'Concerns & Trade-offs'}
              </div>
              {deepAudit.concerns.map((item, idx) => (
                <div
                  key={`concern-${idx}`}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.45 }}
                >
                  <AlertTriangle size={13} style={{ color: 'var(--accent-amber)', flexShrink: 0, marginTop: 2 }} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
