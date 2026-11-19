import { useState, useEffect, useMemo, useRef } from 'react'
import { AlertCircle, BookOpen, Lightbulb, RefreshCw, Sparkles, Terminal, Users, Wrench } from 'lucide-react'
import type { RepositoryReport } from '../../features/repository/types'
import { fetchRepoIntelligence, sanitizeCommitRef } from '../api/backendClient'
import { initiateProUpgrade } from '../auth/supabaseAuth'
import {
  classifySummaryError,
  generateColloquialSpanishSummary,
  generateFallbackSummary,
  mapAnalysisToColloquialSummary,
  type ColloquialExplanation,
} from '../spanishSummary'
import { t, type ActiveLocale } from '../i18n'

type Props = {
  report: RepositoryReport
  locale?: ActiveLocale
  hideTopBanner?: boolean
  refreshNonce?: number
  onQuotaExceeded?: () => void
}

export function ColloquialSummaryCard({
  report,
  locale = 'es',
  hideTopBanner = false,
  refreshNonce = 0,
  onQuotaExceeded,
}: Props) {
  const loadingSummary = useMemo(
    () => generateColloquialSpanishSummary(report, locale),
    [report, locale]
  )
  const fallbackSummary = useMemo(
    () => generateFallbackSummary(report, locale),
    [report, locale]
  )

  const initialSummary = useMemo(() => {
    if (report.aiAnalysis) {
      return mapAnalysisToColloquialSummary(report.aiAnalysis, locale)
    }
    return loadingSummary
  }, [report.aiAnalysis, locale, loadingSummary])

  const [summary, setSummary] = useState<ColloquialExplanation>(initialSummary)
  const [loading, setLoading] = useState<boolean>(!report.aiAnalysis)
  const [quotaExceeded, setQuotaExceeded] = useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState<string | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [upgrading, setUpgrading] = useState(false)
  const [upgradeNotice, setUpgradeNotice] = useState<string | null>(null)
  const [retryTick, setRetryTick] = useState(0)
  const lastRefreshNonceRef = useRef(refreshNonce)
  const lastRetryTickRef = useRef(retryTick)

  useEffect(() => {
    let isCancelled = false
    const owner = report.repository?.owner || report.target?.owner
    const repo = report.repository?.name || report.target?.repository
    const commitSha = sanitizeCommitRef(
      report.latestCommit?.sha || report.resolvedRef || report.repository?.defaultBranch
    )

    const shouldForceRefresh =
      refreshNonce !== lastRefreshNonceRef.current || retryTick !== lastRetryTickRef.current
    lastRefreshNonceRef.current = refreshNonce
    lastRetryTickRef.current = retryTick

    if (report.aiAnalysis && !shouldForceRefresh) {
      setSummary(mapAnalysisToColloquialSummary(report.aiAnalysis, locale))
      setLoading(false)
      setQuotaExceeded(false)
      setMaintenanceMessage(null)
      setAnalysisError(null)
      return
    }

    if (!owner || !repo) {
      setSummary(fallbackSummary)
      setLoading(false)
      setQuotaExceeded(false)
      setMaintenanceMessage(null)
      setAnalysisError(null)
      return
    }

    setLoading(true)
    setQuotaExceeded(false)
    setMaintenanceMessage(null)
    setAnalysisError(null)
    setSummary(loadingSummary)

    void fetchRepoIntelligence(
      owner,
      repo,
      commitSha,
      shouldForceRefresh ? { forceRefresh: true } : undefined
    )
      .then((analysis) => {
        if (!isCancelled) {
          setSummary(mapAnalysisToColloquialSummary(analysis, locale))
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (isCancelled) return
        const errorState = classifySummaryError(err)
        if (errorState.quotaExceeded) {
          setQuotaExceeded(true)
          onQuotaExceeded?.()
          return
        }
        setQuotaExceeded(false)
        setMaintenanceMessage(errorState.maintenanceMode ? errorState.errorMessage : null)
        setAnalysisError(errorState.maintenanceMode ? null : errorState.errorMessage)
        setSummary(fallbackSummary)
        setLoading(false)
      })

    return () => {
      isCancelled = true
    }
  }, [report, locale, loadingSummary, fallbackSummary, retryTick, refreshNonce, onQuotaExceeded])

  const handleUpgrade = async () => {
    setUpgradeNotice(null)
    setUpgrading(true)
    try {
      const session = await initiateProUpgrade()
      if (!session) {
        setUpgradeNotice(t('upgrade_cancelled_notice', locale))
      }
    } catch (err) {
      setUpgradeNotice(
        err instanceof Error && err.message ? err.message : t('upgrade_cancelled_notice', locale)
      )
    } finally {
      setUpgrading(false)
    }
  }

  if (quotaExceeded) {
    return null
  }

  return (
    <div className="colloquial-container" aria-busy={loading}>
      {/* Top Banner Tag */}
      {!hideTopBanner && (
        <div className="colloquial-banner-row">
          <div className="colloquial-pill-main">
            <BookOpen size={14} style={{ color: 'var(--text-secondary)' }} />
            <span className="colloquial-title-text">{t('repo_explanation', locale)}</span>
          </div>

          <div className="colloquial-tags-wrap">
            {summary.stackPills.map((pill, i) => (
              <span key={i} className="colloquial-chip">
                {pill}
              </span>
            ))}
          </div>
        </div>
      )}

      {maintenanceMessage && (
        <div
          className="insight-card"
          style={{
            border: '1px solid rgba(244, 63, 94, 0.35)',
            background: 'rgba(244, 63, 94, 0.08)',
            marginBottom: 10,
            padding: 10,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
          }}
        >
          <Wrench size={14} style={{ color: 'var(--accent-rose)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: 2 }}>
              {t('maintenance_title', locale)}
            </strong>
            <span>{maintenanceMessage}</span>
          </div>
        </div>
      )}

      {analysisError && !quotaExceeded && !maintenanceMessage && (
        <div
          className="insight-card"
          style={{
            border: '1px solid rgba(245, 158, 11, 0.35)',
            background: 'rgba(245, 158, 11, 0.08)',
            marginBottom: 10,
            padding: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-secondary)' }}>
            <AlertCircle size={14} style={{ color: 'var(--accent-amber)', flexShrink: 0 }} />
            <span>{t('ai_error_notice', locale)}</span>
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
      )}

      {/* Main explanation */}
      {loading ? (
        <div className="colloquial-ai-loading-box">
          <div className="colloquial-ai-loading-header">
            <div className="colloquial-ai-pulse-icon">
              <Sparkles size={16} className="animate-pulse" />
            </div>
            <div className="colloquial-ai-loading-text">
              <span className="colloquial-ai-loading-title">
                {locale === 'es' ? 'Estructurando explicación con IA...' : 'Structuring AI explanation...'}
              </span>
              <span className="colloquial-ai-loading-subtitle">
                {locale === 'es'
                  ? 'Sintetizando propósito, valor clave y aplicaciones prácticas'
                  : 'Synthesizing purpose, key value, and practical use cases'}
              </span>
            </div>
          </div>

          <div className="colloquial-shimmer-body">
            <div className="colloquial-shimmer-line line-lead" />
            <div className="colloquial-shimmer-line line-long" />
            <div className="colloquial-shimmer-line line-medium" />
            <div className="colloquial-shimmer-grid">
              <div className="colloquial-shimmer-box" />
              <div className="colloquial-shimmer-box" />
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="colloquial-box-lead">
            <div className="colloquial-label-kicker" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span>{t('what_is_it', locale)}</span>
            </div>
            <p className="colloquial-text-lead">{summary.whatItIs}</p>
          </div>

          {/* 2-Column Bento Highlights */}
          <div className="colloquial-grid-two">
            <div className="colloquial-mini-card">
              <div className="colloquial-mini-header">
                <Lightbulb size={13} className="text-amber" />
                <span>{t('why_it_matters', locale)}</span>
              </div>
              <p className="colloquial-mini-text">{summary.whyItMatters}</p>
            </div>

            <div className="colloquial-mini-card">
              <div className="colloquial-mini-header">
                <Terminal size={13} style={{ color: 'var(--text-secondary)' }} />
                <span>{t('in_practice', locale)}</span>
              </div>
              <p className="colloquial-mini-text">{summary.practicalUse}</p>
            </div>
          </div>

          {/* Audience Footer */}
          <div className="colloquial-footer-tag">
            <Users size={13} className="text-muted" />
            <span>
              {t('ideal_for', locale)} <strong>{summary.targetAudience}</strong>
            </span>
          </div>
        </>
      )}
    </div>
  )
}
