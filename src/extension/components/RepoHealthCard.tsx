import { useState, useMemo } from 'react'
import { Activity, X } from 'lucide-react'
import type { RepositoryReport } from '../../features/repository/types'
import { calculateRepoHealth, type HealthScoreBreakdown } from '../../features/repository/health'
import type { ActiveLocale } from '../i18n'

type RepoHealthCardProps = {
  report: RepositoryReport
  locale?: ActiveLocale
  compact?: boolean
}

export function RepoHealthCard({ report, locale = 'es', compact = false }: RepoHealthCardProps) {
  const isEs = locale === 'es'
  const [showModal, setShowModal] = useState(false)

  const health = useMemo(() => calculateRepoHealth(report, locale), [report, locale])

  // Compact Pill Badge in Hero Header
  if (compact) {
    return (
      <>
        <button
          type="button"
          className="repo-health-pill-btn"
          onClick={() => setShowModal(true)}
          title={isEs ? 'Ver índice de salud y mantenimiento del repo' : 'View repository health and maintenance score'}
          style={{ borderColor: health.color }}
        >
          <Activity size={11} style={{ color: health.color }} />
          <span style={{ fontWeight: 700, color: health.color }}>{health.score}/100</span>
          <span style={{ color: 'var(--text-secondary)' }}>· {health.label}</span>
        </button>

        {showModal && (
          <div className="ext-settings-modal-overlay" onClick={() => setShowModal(false)}>
            <div
              className="ext-settings-modal-card"
              style={{ maxWidth: 420 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="ext-settings-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }}>
                  <Activity size={15} style={{ color: health.color }} />
                  <span>{isEs ? 'Índice de Salud & Actividad' : 'Repo Health & Activity Score'}</span>
                </div>
                <button type="button" className="ext-btn-icon" onClick={() => setShowModal(false)}>
                  <X size={14} />
                </button>
              </div>

              <div className="ext-settings-modal-body">
                <RepoHealthDetailsContent health={health} isEs={isEs} />
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="repo-health-full-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Activity size={15} style={{ color: health.color }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
            {isEs ? 'Salud & Actividad del Repositorio' : 'Repository Health & Activity'}
          </span>
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: 6,
            background: 'var(--bg-surface-elevated)',
            color: health.color,
            border: `1px solid ${health.color}40`,
          }}
        >
          {health.score}/100 · {health.label}
        </span>
      </div>

      <RepoHealthDetailsContent health={health} isEs={isEs} />
    </div>
  )
}

function RepoHealthDetailsContent({ health, isEs }: { health: HealthScoreBreakdown; isEs: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Big Verdict Box */}
      <div
        style={{
          padding: 10,
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-surface-elevated)',
          border: `1px solid ${health.color}35`,
          fontSize: 12,
          lineHeight: 1.45,
          color: 'var(--text-primary)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 16 }}>{health.status === 'active' ? '🟢' : health.status === 'stable' ? '🔵' : health.status === 'low_activity' ? '🟡' : '🔴'}</span>
        <div>
          <strong>{health.label}:</strong> {health.verdict}
        </div>
      </div>

      {/* Progress Metric Bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Recency */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              {isEs ? 'Recencia de Commits' : 'Commit Recency'} ({health.timeAgoText})
            </span>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{health.details.commitScore}/35</span>
          </div>
          <div className="health-progress-bar-bg">
            <div className="health-progress-bar-fill" style={{ width: `${(health.details.commitScore / 35) * 100}%`, background: health.color }} />
          </div>
        </div>

        {/* Community & Issues */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              {isEs ? 'Salud de Issues & Comunidad' : 'Community & Issues Health'}
            </span>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{health.details.communityScore}/25</span>
          </div>
          <div className="health-progress-bar-bg">
            <div className="health-progress-bar-fill" style={{ width: `${(health.details.communityScore / 25) * 100}%`, background: 'var(--accent-cyan)' }} />
          </div>
        </div>

        {/* Releases & Stability */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              {isEs ? 'Releases Oficiales & Versiones' : 'Official Releases & Tags'}
            </span>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{health.details.releaseScore}/15</span>
          </div>
          <div className="health-progress-bar-bg">
            <div className="health-progress-bar-fill" style={{ width: `${(health.details.releaseScore / 15) * 100}%`, background: 'var(--accent-violet)' }} />
          </div>
        </div>

        {/* Governance & Docs */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              {isEs ? 'Licencia, README & Documentación' : 'License, README & Docs'}
            </span>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{health.details.governanceScore}/25</span>
          </div>
          <div className="health-progress-bar-bg">
            <div className="health-progress-bar-fill" style={{ width: `${(health.details.governanceScore / 25) * 100}%`, background: 'var(--accent-amber)' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
