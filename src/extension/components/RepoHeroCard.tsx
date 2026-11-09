import React from 'react'
import { Tag, GitFork, Star } from 'lucide-react'
import type { RepositoryReport } from '../../features/repository/types'
import { getLanguageColor } from '../../features/repository/github'
import type { ActiveLocale } from '../i18n'
import { t } from '../i18n'
import { LicenseBadge } from './LicenseModal'
import { SecurityAuditBadge } from './SecurityAuditBadge'
import { RepoHealthCard } from './RepoHealthCard'
import { AnalysisMascot } from './AnalysisMascot'
import { SpotlightCard } from './SpotlightCard'
import { NumberTicker } from './NumberTicker'

interface RepoHeroCardProps {
  report: RepositoryReport
  locale?: ActiveLocale
  onOpenLicenseModal?: () => void
  actions?: React.ReactNode
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  }
  return num.toLocaleString()
}

export const RepoHeroCard: React.FC<RepoHeroCardProps> = ({
  report,
  locale = 'es',
  actions,
}) => {
  const repo = report.repository
  const primaryLanguage = report.languages?.[0]?.name || null
  const langColor = primaryLanguage ? getLanguageColor(primaryLanguage) : '#6e7681'

  return (
    <SpotlightCard className="brand-hero-card" spotlightColor="rgba(46, 160, 67, 0.12)">
      <div className="brand-hero-main-row">
        {/* Left Column: GitHub icon, title, description, and metric pills */}
        <div className="brand-hero-left">
          {/* Top row with GitHub square badge + Title & Description column */}
          <div className="brand-hero-top-info">
            <div className="brand-hero-gh-badge" title="GitHub Repository">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
            </div>

            <div className="brand-hero-meta-col">
              <div className="brand-hero-title-line">
                <a
                  href={repo.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="brand-hero-title"
                  title={t('open_in_github', locale)}
                >
                  <span>{repo.fullName}</span>
                </a>
                {actions && <div className="brand-hero-actions">{actions}</div>}
              </div>

              {repo.description && (
                <p className="brand-hero-desc" title={repo.description}>
                  {repo.description}
                </p>
              )}
            </div>
          </div>

          {/* Metric and info pills row (matching the brand mockup) */}
          <div className="brand-hero-pills">
            {/* Stars */}
            <span className="brand-pill" title={`${repo.stars.toLocaleString()} ${t('stars', locale)}`}>
              <Star size={11} className="brand-pill-icon-svg" />
              <span className="brand-pill-text">
                <NumberTicker value={repo.stars} />
              </span>
            </span>

            {/* Forks */}
            <span className="brand-pill" title={`${repo.forks.toLocaleString()} ${t('forks', locale)}`}>
              <GitFork size={11} className="brand-pill-icon-svg" />
              <span className="brand-pill-text">
                <NumberTicker value={repo.forks} />
              </span>
            </span>

            {/* Language */}
            {primaryLanguage && (
              <span className="brand-pill" title={`Lenguaje principal: ${primaryLanguage}`}>
                <span className="brand-pill-dot" style={{ backgroundColor: langColor }} />
                <span className="brand-pill-text">{primaryLanguage}</span>
              </span>
            )}

            {/* Default Branch */}
            {repo.defaultBranch && (
              <span className="brand-pill brand-pill-subtle" title={`Rama: ${repo.defaultBranch}`}>
                <Tag size={10} />
                <span className="brand-pill-text">{repo.defaultBranch}</span>
              </span>
            )}

            {/* Licencia */}
            <LicenseBadge report={report} locale={locale} />

            {/* Auditoría de Seguridad */}
            <SecurityAuditBadge report={report} locale={locale} />

            {/* Salud y Actividad */}
            <RepoHealthCard report={report} locale={locale} compact />
          </div>
        </div>

        {/* Right Column: Dynamic Analysis Mascot matching emotional status */}
        <div className="brand-hero-mascot-col">
          <AnalysisMascot report={report} size={84} />
        </div>
      </div>
    </SpotlightCard>
  )
}
