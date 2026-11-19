import { useEffect, useId, useMemo, useRef, useState } from 'react'
import mermaid from 'mermaid'
import {
  AlertCircle,
  Check,
  Code2,
  Copy,
  Layers,
  Lock,
  RefreshCw,
  Sparkles,
  Wrench,
  Zap,
} from 'lucide-react'
import type { RepositoryReport } from '../../features/repository/types'
import {
  fetchRemoteConfig,
  fetchRepoIntelligence,
  sanitizeCommitRef,
  type FilteredAnalysisResult,
  type ModuleAccessLevel,
} from '../api/backendClient'
import {
  getAuthSession,
  initiateProUpgrade,
  refreshProStatus,
  subscribeToAuthSession,
  type AuthSession,
} from '../auth/supabaseAuth'
import { t, type ActiveLocale } from '../i18n'
import { classifySummaryError } from '../spanishSummary'
import { sanitizeMermaidDiagram } from '../utils/mermaidSanitizer'
import { generateNativeArchitectureDiagram } from '../utils/nativeArchitectureGenerator'

type ArchitectureDiagramViewProps = {
  report: RepositoryReport
  locale?: ActiveLocale
  diagramsEnabled?: boolean
  archAccess?: ModuleAccessLevel
  isPro?: boolean
  onAnalysisUpdated?: (updatedAnalysis: FilteredAnalysisResult) => void
  onQuotaExceeded?: () => void
}

let mermaidInitialized = false

function ensureMermaidInitialized() {
  if (mermaidInitialized) return
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
    suppressErrorRendering: true,
  })
  mermaidInitialized = true
}

export function ArchitectureDiagramView({
  report,
  locale = 'es',
  diagramsEnabled,
  archAccess,
  isPro,
  onAnalysisUpdated,
  onQuotaExceeded,
}: ArchitectureDiagramViewProps) {
  const isEs = locale === 'es'
  const renderSeed = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const svgContainerRef = useRef<HTMLDivElement | null>(null)

  const [engineMode, setEngineMode] = useState<'native' | 'ai'>('native')
  const [analysis, setAnalysis] = useState<FilteredAnalysisResult | null>(report.aiAnalysis ?? null)
  const [session, setSession] = useState<AuthSession | null>(null)
  const [remoteDiagramsEnabled, setRemoteDiagramsEnabled] = useState<boolean>(
    diagramsEnabled ?? true
  )
  const [aiLoading, setAiLoading] = useState<boolean>(false)
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

  const effectiveIsPro = isPro !== undefined ? isPro : Boolean(session?.isPro)
  const effectiveArchAccess = archAccess ?? 'pro'

  // 1. Generate Native Diagram locally (0ms, client-side, 100% reliable)
  const nativeDiagram = useMemo(
    () => generateNativeArchitectureDiagram(report, locale),
    [report, locale]
  )

  // 2. AI Diagram (from analysis result if available)
  const rawAiDiagram = analysis?.architectureDiagram?.trim() || ''
  const aiDiagram = useMemo(() => sanitizeMermaidDiagram(rawAiDiagram), [rawAiDiagram])

  // Active diagram depending on engineMode
  const activeDiagramCode = engineMode === 'ai' ? aiDiagram : nativeDiagram

  // Subscribe to live auth session updates across storage
  useEffect(() => {
    void getAuthSession().then(setSession).catch(() => {})
    return subscribeToAuthSession((updated) => {
      setSession(updated)
    })
  }, [])

  useEffect(() => {
    if (typeof diagramsEnabled === 'boolean') {
      setRemoteDiagramsEnabled(diagramsEnabled)
    }
  }, [diagramsEnabled])

  // Background fetch for AI analysis (only if user requests AI or is Pro)
  useEffect(() => {
    let cancelled = false
    const owner = report.repository?.owner || report.target?.owner
    const repo = report.repository?.name || report.target?.repository
    const commitSha = sanitizeCommitRef(
      report.latestCommit?.sha || report.resolvedRef || report.repository?.defaultBranch
    )

    if (!owner || !repo) {
      setAnalysis(null)
      setAiLoading(false)
      return
    }

    const shouldForce = forceNextFetch
    if (shouldForce) {
      setForceNextFetch(false)
    }

    if (report.aiAnalysis?.architectureDiagram && !shouldForce) {
      setAnalysis(report.aiAnalysis)
      setAiLoading(false)
      setQuotaExceeded(false)
      return
    }

    if (!shouldForce && !effectiveIsPro && effectiveArchAccess === 'pro') {
      // Don't make unneeded AI calls for free users if backend gates AI diagram
      setAiLoading(false)
      return
    }

    setAiLoading(true)
    setQuotaExceeded(false)
    setMaintenanceMessage(null)
    setErrorMessage(null)

    void Promise.all([
      fetchRepoIntelligence(
        owner,
        repo,
        commitSha,
        shouldForce || !report.aiAnalysis?.architectureDiagram ? { forceRefresh: true } : undefined
      ),
      getAuthSession(),
      typeof diagramsEnabled === 'boolean'
        ? Promise.resolve(null)
        : fetchRemoteConfig().catch(() => null),
    ])
      .then(([intel, currentSession, remoteConfig]) => {
        if (cancelled) return
        setAnalysis(intel)
        if (currentSession) setSession(currentSession)
        if (remoteConfig) {
          setRemoteDiagramsEnabled(remoteConfig.featureFlags.enableDiagrams)
        }
        setAiLoading(false)
        if (intel.architectureDiagram) {
          onAnalysisUpdated?.(intel)
        }
      })
      .catch(async (err: unknown) => {
        if (cancelled) return
        const currentSession = await getAuthSession().catch(() => null)
        if (cancelled) return
        if (currentSession) setSession(currentSession)
        const state = classifySummaryError(err)
        if (state.quotaExceeded) {
          setQuotaExceeded(true)
          onQuotaExceeded?.()
          return
        }
        setQuotaExceeded(false)
        setMaintenanceMessage(state.maintenanceMode ? state.errorMessage : null)
        setErrorMessage(state.maintenanceMode ? null : state.errorMessage)
        setAiLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    report,
    retryTick,
    diagramsEnabled,
    forceNextFetch,
    onQuotaExceeded,
    effectiveIsPro,
    effectiveArchAccess,
    onAnalysisUpdated,
  ])

  // Mermaid SVG renderer
  useEffect(() => {
    if (!activeDiagramCode || viewMode !== 'diagram') {
      setRenderFailed(false)
      return
    }

    let cancelled = false
    setRenderFailed(false)

    async function renderMermaidSvg() {
      try {
        ensureMermaidInitialized()
        const diagramId = `gpi-mermaid-${renderSeed}-${Date.now()}`
        const { svg } = await mermaid.render(diagramId, activeDiagramCode)
        if (cancelled || !svgContainerRef.current) return

        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
        const parserError = doc.querySelector('parsererror')
        const svgElement = doc.documentElement
        if (parserError || !svgElement || svgElement.tagName.toLowerCase() !== 'svg') {
          setRenderFailed(true)
          return
        }

        svgContainerRef.current.replaceChildren(document.importNode(svgElement, true))
      } catch (renderErr) {
        console.warn('Mermaid render failed:', renderErr)
        // Clean up any stray error element mermaid injected into document.body
        const stray = document.querySelectorAll('svg[id^="d"], svg[id^="mermaid-"]')
        stray.forEach((el) => {
          if (el.parentElement === document.body) {
            el.remove()
          }
        })
        if (!cancelled) {
          setRenderFailed(true)
        }
      }
    }

    void renderMermaidSvg()
    return () => {
      cancelled = true
    }
  }, [activeDiagramCode, viewMode, renderSeed])

  const handleCopyCode = async () => {
    if (!activeDiagramCode) return
    try {
      await navigator.clipboard.writeText(activeDiagramCode)
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

  // If in AI mode and user is not Pro, show Pro lock card with quick switch back to Native
  if (engineMode === 'ai' && effectiveArchAccess === 'pro' && !effectiveIsPro) {
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
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setEngineMode('native')}
            style={{ padding: '3px 8px', fontSize: 11 }}
          >
            <Zap size={11} style={{ marginRight: 4, color: 'var(--accent-cyan)' }} />
            <span>{t('arch_mode_native', locale)}</span>
          </button>
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

  // If in AI mode and loading without cached AI diagram
  if (engineMode === 'ai' && aiLoading && !aiDiagram) {
    return (
      <div className="architecture-diagram-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
            <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--accent-cyan)' }} />
            <span>{isEs ? 'Generando análisis de arquitectura con IA...' : 'Generating AI architecture diagram...'}</span>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setEngineMode('native')}
            style={{ padding: '3px 8px', fontSize: 11 }}
          >
            <Zap size={11} style={{ marginRight: 4, color: 'var(--accent-cyan)' }} />
            <span>{t('arch_mode_native', locale)}</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="architecture-diagram-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {engineMode === 'native' ? (
              <Zap size={16} style={{ color: 'var(--accent-cyan)' }} />
            ) : (
              <Sparkles size={16} style={{ color: 'var(--brand-primary)' }} />
            )}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {engineMode === 'native' ? t('arch_title_native', locale) : t('arch_title_ai', locale)}
                </span>
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 10,
                    background: engineMode === 'native' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                    color: engineMode === 'native' ? 'var(--accent-cyan)' : 'var(--accent-violet)',
                  }}
                >
                  {engineMode === 'native' ? 'NATIVO' : 'IA'}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Mode Selector: Nativo vs IA */}
            <div
              style={{
                display: 'flex',
                background: 'rgba(0, 0, 0, 0.25)',
                borderRadius: 'var(--radius-sm)',
                padding: 2,
                border: '1px solid var(--border-subtle)',
              }}
            >
              <button
                type="button"
                className={`btn-secondary ${engineMode === 'native' ? 'active' : ''}`}
                onClick={() => setEngineMode('native')}
                style={{
                  padding: '3px 8px',
                  fontSize: 10.5,
                  fontWeight: engineMode === 'native' ? 700 : 500,
                  border: 'none',
                }}
              >
                <Zap size={11} style={{ marginRight: 3, color: engineMode === 'native' ? 'var(--accent-cyan)' : undefined }} />
                <span>{t('arch_mode_native', locale)}</span>
              </button>
              <button
                type="button"
                className={`btn-secondary ${engineMode === 'ai' ? 'active' : ''}`}
                onClick={() => setEngineMode('ai')}
                style={{
                  padding: '3px 8px',
                  fontSize: 10.5,
                  fontWeight: engineMode === 'ai' ? 700 : 500,
                  border: 'none',
                }}
              >
                <Sparkles size={11} style={{ marginRight: 3, color: engineMode === 'ai' ? 'var(--brand-primary)' : undefined }} />
                <span>{t('arch_mode_ai', locale)}</span>
              </button>
            </div>

            {/* View Mode Buttons */}
            {activeDiagramCode && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  className={`btn-secondary ${viewMode === 'diagram' ? 'active' : ''}`}
                  onClick={() => setViewMode('diagram')}
                  style={{ padding: '3px 8px', fontSize: 11 }}
                >
                  <Layers size={11} />
                  <span>Visual</span>
                </button>
                <button
                  type="button"
                  className={`btn-secondary ${viewMode === 'code' ? 'active' : ''}`}
                  onClick={() => setViewMode('code')}
                  style={{ padding: '3px 8px', fontSize: 11 }}
                >
                  <Code2 size={11} />
                  <span>Mermaid</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void handleCopyCode()}
                  title={isEs ? 'Copiar código Mermaid' : 'Copy Mermaid code'}
                  style={{ padding: '3px 8px', fontSize: 11 }}
                >
                  {copiedMermaid ? <Check size={11} style={{ color: 'var(--accent-emerald)' }} /> : <Copy size={11} />}
                  <span>{copiedMermaid ? (isEs ? 'Copiado' : 'Copied') : (isEs ? 'Copiar' : 'Copy')}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Canvas / Code View */}
        {viewMode === 'diagram' && !renderFailed ? (
          <div className="diagram-canvas-box" style={{ padding: 10, overflowX: 'auto' }}>
            <div ref={svgContainerRef} className="mermaid-rendered-svg" style={{ width: '100%' }} />
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            {renderFailed && viewMode === 'diagram' && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                {isEs
                  ? 'Mostrando fuente Mermaid del diagrama:'
                  : 'Showing Mermaid diagram source:'}
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
              {activeDiagramCode}
            </pre>
          </div>
        )}

        {/* Footer Subtitle */}
        {activeDiagramCode && (
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5, color: 'var(--text-muted)' }}>
            <span>
              {engineMode === 'native' ? t('arch_native_subtitle', locale) : t('arch_ai_subtitle', locale)}
            </span>
            <span>{isEs ? 'Compatible con Notion y GitHub' : 'Compatible with Notion & GitHub'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
