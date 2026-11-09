import { useState, useMemo } from 'react'
import type { RepositoryReport } from '../../features/repository/types'
import { GitCompare, Star, GitFork, CircleDot, HardDrive, FileCode, Shield } from 'lucide-react'
import type { ActiveLocale } from '../i18n'

type CompareViewProps = {
  reports: RepositoryReport[]
  currentReport?: RepositoryReport | null
  onSelectReport?: (report: RepositoryReport) => void
  locale?: ActiveLocale
}

export function CompareView({ reports, currentReport, locale = 'es' }: CompareViewProps) {
  const isEs = locale === 'es'
  const [firstId, setFirstId] = useState<string>(currentReport ? currentReport.repository.fullName : reports[0]?.repository.fullName || '')
  const [secondId, setSecondId] = useState<string>(
    reports.find((r) => r.repository.fullName !== firstId)?.repository.fullName || reports[1]?.repository.fullName || ''
  )

  const repoA = useMemo(() => reports.find((r) => r.repository.fullName === firstId) || (firstId === currentReport?.repository.fullName ? currentReport : null), [reports, firstId, currentReport])
  const repoB = useMemo(() => reports.find((r) => r.repository.fullName === secondId) || (secondId === currentReport?.repository.fullName ? currentReport : null), [reports, secondId, currentReport])

  const options = useMemo(() => {
    const map = new Map<string, RepositoryReport>()
    if (currentReport) map.set(currentReport.repository.fullName, currentReport)
    reports.forEach((r) => map.set(r.repository.fullName, r))
    return Array.from(map.values())
  }, [reports, currentReport])

  if (options.length < 2) {
    return (
      <div className="ext-empty-state">
        <GitCompare size={36} style={{ color: 'var(--text-muted)' }} />
        <p className="empty-title">{isEs ? 'Comparación de Repositorios' : 'Repository Comparison'}</p>
        <p className="empty-desc">
          {isEs
            ? 'Analiza o guarda al menos dos repositorios para compararlos lado a lado.'
            : 'Analyze or save at least two repositories to compare them side by side.'}
        </p>
      </div>
    )
  }

  return (
    <div className="compare-container">
      <div className="compare-selector-row">
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            {isEs ? 'Repositorio 1' : 'Repository 1'}
          </label>
          <select
            value={firstId}
            onChange={(e) => setFirstId(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-surface-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              fontSize: 12,
            }}
          >
            {options.map((r) => (
              <option key={r.repository.fullName} value={r.repository.fullName}>
                {r.repository.fullName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            {isEs ? 'Repositorio 2' : 'Repository 2'}
          </label>
          <select
            value={secondId}
            onChange={(e) => setSecondId(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-surface-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              fontSize: 12,
            }}
          >
            {options.map((r) => (
              <option key={r.repository.fullName} value={r.repository.fullName}>
                {r.repository.fullName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {repoA && repoB && (
        <div className="compare-grid">
          <div className="compare-row" style={{ fontWeight: 700, background: 'var(--bg-surface-elevated)' }}>
            <span className="compare-label">{isEs ? 'Métrica' : 'Metric'}</span>
            <span style={{ color: 'var(--accent-cyan)' }}>{repoA.repository.name}</span>
            <span style={{ color: 'var(--accent-violet)' }}>{repoB.repository.name}</span>
          </div>

          <div className="compare-row">
            <span className="compare-label"><Star size={11} style={{ display: 'inline', marginRight: 4 }} />{isEs ? 'Estrellas' : 'Stars'}</span>
            <span className="compare-val">{repoA.repository.stars.toLocaleString()}</span>
            <span className="compare-val">{repoB.repository.stars.toLocaleString()}</span>
          </div>

          <div className="compare-row">
            <span className="compare-label"><GitFork size={11} style={{ display: 'inline', marginRight: 4 }} />Forks</span>
            <span className="compare-val">{repoA.repository.forks.toLocaleString()}</span>
            <span className="compare-val">{repoB.repository.forks.toLocaleString()}</span>
          </div>

          <div className="compare-row">
            <span className="compare-label"><CircleDot size={11} style={{ display: 'inline', marginRight: 4 }} />Issues</span>
            <span className="compare-val">{repoA.repository.openIssues.toLocaleString()}</span>
            <span className="compare-val">{repoB.repository.openIssues.toLocaleString()}</span>
          </div>

          <div className="compare-row">
            <span className="compare-label"><HardDrive size={11} style={{ display: 'inline', marginRight: 4 }} />{isEs ? 'Tamaño' : 'Size'}</span>
            <span className="compare-val">{(repoA.repository.sizeKb / 1024).toFixed(1)} MB</span>
            <span className="compare-val">{(repoB.repository.sizeKb / 1024).toFixed(1)} MB</span>
          </div>

          <div className="compare-row">
            <span className="compare-label"><FileCode size={11} style={{ display: 'inline', marginRight: 4 }} />{isEs ? 'Lenguaje' : 'Language'}</span>
            <span className="compare-val">{repoA.languages[0]?.name || 'N/A'}</span>
            <span className="compare-val">{repoB.languages[0]?.name || 'N/A'}</span>
          </div>

          <div className="compare-row">
            <span className="compare-label">{isEs ? 'Dependencias' : 'Dependencies'}</span>
            <span className="compare-val">{repoA.dependencies?.length || 0} {isEs ? 'dependencias' : 'deps'}</span>
            <span className="compare-val">{repoB.dependencies?.length || 0} {isEs ? 'dependencias' : 'deps'}</span>
          </div>

          <div className="compare-row">
            <span className="compare-label"><Shield size={11} style={{ display: 'inline', marginRight: 4 }} />{isEs ? 'Licencia' : 'License'}</span>
            <span className="compare-val">{repoA.repository.license?.name || (isEs ? 'Sin licencia' : 'No license')}</span>
            <span className="compare-val">{repoB.repository.license?.name || (isEs ? 'Sin licencia' : 'No license')}</span>
          </div>

          <div className="compare-row">
            <span className="compare-label">{isEs ? 'Último Release' : 'Latest Release'}</span>
            <span className="compare-val">{repoA.latestRelease?.tagName || (isEs ? 'Sin release' : 'No release')}</span>
            <span className="compare-val">{repoB.latestRelease?.tagName || (isEs ? 'Sin release' : 'No release')}</span>
          </div>
        </div>
      )}
    </div>
  )
}
