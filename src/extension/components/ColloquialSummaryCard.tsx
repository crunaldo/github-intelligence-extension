import { useState, useEffect, useMemo } from 'react'
import { AlertCircle, BookOpen, Lightbulb, RefreshCw, Sparkles, Terminal, Users } from 'lucide-react'
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
}

export function ColloquialSummaryCard({ report, locale = 'es', hideTopBanner = false }: Props) {
  const loadingSummary = useMemo(
    () => generateColloquialSpanishSummary(report, locale),
    [report, locale]
  )
  const fallbackSummary = useMemo(
    () => generateFallbackSummary(report, locale),
    [report, locale]
  )

  const [summary, setSummary] = useState<ColloquialExplanation>(loadingSummary)
  const [loading, setLoading] = useState(true)
  const [quotaExceeded, setQuotaExceeded] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [upgrading, setUpgrading] = useState(false)
  const [retryTick, setRetryTick] = useState(0)

  useEffect(() => {
    let isCancelled = false
    const owner = report.repository?.owner || report.target?.owner
    const repo = report.repository?.name || report.target?.repository
    const commitSha = sanitizeCommitRef(
      report.latestCommit?.sha || report.resolvedRef || report.repository?.defaultBranch
    )

    if (!owner || !repo) {
      setSummary(fallbackSummary)
      setLoading(false)
      setQuotaExceeded(false)
      setAnalysisError(null)
      return
    }

    setLoading(true)
    setQuotaExceeded(false)
    setAnalysisError(null)
    setSummary(loadingSummary)

    void fetchRepoIntelligence(owner, repo, commitSha)
      .then((analysis) => {
        if (!isCancelled) {
          setSummary(mapAnalysisToColloquialSummary(analysis, locale))
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (isCancelled) return
        const errorState = classifySummaryError(err)
        setQuotaExceeded(errorState.quotaExceeded)
        setAnalysisError(errorState.errorMessage)
        setSummary(fallbackSummary)
        setLoading(false)
      })

    return () => {
      isCancelled = true
    }
  }, [report, locale, loadingSummary, fallbackSummary, retryTick])

  const handleUpgrade = async () => {
    setUpgrading(true)
    try {
      await initiateProUpgrade()
    } finally {
      setUpgrading(false)
    }
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

      {quotaExceeded && (
        <div
          className="insight-card"
          style={{
            border: '1px solid var(--accent-cyan)',
            background: 'var(--accent-cyan-subtle)',
            marginBottom: 10,
            padding: 12,
          }}
        >
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
        </div>
      )}

      {analysisError && !quotaExceeded && (
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
    </div>
  )
}
