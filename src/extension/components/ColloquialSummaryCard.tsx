import { useState, useEffect, useMemo } from 'react'
import { BookOpen, Lightbulb, Terminal, Users } from 'lucide-react'
import type { RepositoryReport } from '../../features/repository/types'
import { generateColloquialSpanishSummary } from '../spanishSummary'
import { translateText } from '../translate'
import { t, type ActiveLocale } from '../i18n'

type Props = {
  report: RepositoryReport
  locale?: ActiveLocale
  hideTopBanner?: boolean
}

export function ColloquialSummaryCard({ report, locale = 'es', hideTopBanner = false }: Props) {
  const initialSummary = useMemo(() => generateColloquialSpanishSummary(report, locale), [report, locale])
  const [liveWhatItIs, setLiveWhatItIs] = useState<string>(initialSummary.whatItIs)

  // Asynchronously translate or polish the description if available
  useEffect(() => {
    let isCancelled = false
    const desc = report.repository?.description?.trim()

    if (desc && desc.length > 5) {
      void translateText(desc, locale).then((translated) => {
        if (!isCancelled && translated && translated.length > 5) {
          let clean = translated.charAt(0).toUpperCase() + translated.slice(1)
          if (!clean.endsWith('.')) clean += '.'
          setLiveWhatItIs(clean)
        }
      })
    } else {
      setLiveWhatItIs(initialSummary.whatItIs)
    }

    return () => {
      isCancelled = true
    }
  }, [report, initialSummary, locale])

  return (
    <div className="colloquial-container">
      {/* Top Banner Tag */}
      {!hideTopBanner && (
        <div className="colloquial-banner-row">
          <div className="colloquial-pill-main">
            <BookOpen size={14} style={{ color: 'var(--text-secondary)' }} />
            <span className="colloquial-title-text">{t('repo_explanation', locale)}</span>
          </div>

          <div className="colloquial-tags-wrap">
            {initialSummary.stackPills.map((pill, i) => (
              <span key={i} className="colloquial-chip">
                {pill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Main explanation */}
      <div className="colloquial-box-lead">
        <div className="colloquial-label-kicker" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span>{t('what_is_it', locale)}</span>
        </div>
        <p className="colloquial-text-lead">{liveWhatItIs}</p>
      </div>

      {/* 2-Column Bento Highlights */}
      <div className="colloquial-grid-two">
        <div className="colloquial-mini-card">
          <div className="colloquial-mini-header">
            <Lightbulb size={13} className="text-amber" />
            <span>{t('why_it_matters', locale)}</span>
          </div>
          <p className="colloquial-mini-text">{initialSummary.whyItMatters}</p>
        </div>

        <div className="colloquial-mini-card">
          <div className="colloquial-mini-header">
            <Terminal size={13} style={{ color: 'var(--text-secondary)' }} />
            <span>{t('in_practice', locale)}</span>
          </div>
          <p className="colloquial-mini-text">{initialSummary.practicalUse}</p>
        </div>
      </div>

      {/* Audience Footer */}
      <div className="colloquial-footer-tag">
        <Users size={13} className="text-muted" />
        <span>
          {t('ideal_for', locale)} <strong>{initialSummary.targetAudience}</strong>
        </span>
      </div>
    </div>
  )
}
