// Repository Health and Activity Index (Health Score Engine)

import type { RepositoryReport } from './types'
import type { ActiveLocale } from '../../extension/i18n'

export type HealthStatus = 'active' | 'stable' | 'low_activity' | 'abandoned'

export type HealthScoreBreakdown = {
  score: number // 0 - 100
  status: HealthStatus
  label: string
  color: string
  daysSinceLastCommit: number | null
  timeAgoText: string
  verdict: string
  details: {
    commitScore: number // max 35
    communityScore: number // max 25
    releaseScore: number // max 15
    governanceScore: number // max 25
  }
}

export function calculateRepoHealth(report: RepositoryReport, locale: ActiveLocale = 'es'): HealthScoreBreakdown {
  const isEs = locale === 'es'

  // 1. Calculate days since last commit
  let daysSinceLastCommit: number | null = null
  let timeAgoText = isEs ? 'Fecha no disponible' : 'Date not available'

  const commitDateStr = report.latestCommit?.date || report.repository.pushedAt
  if (commitDateStr) {
    const commitDate = new Date(commitDateStr)
    const now = new Date()
    const diffMs = Math.max(0, now.getTime() - commitDate.getTime())
    daysSinceLastCommit = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (daysSinceLastCommit === 0) {
      timeAgoText = isEs ? 'hoy' : 'today'
    } else if (daysSinceLastCommit === 1) {
      timeAgoText = isEs ? 'ayer' : 'yesterday'
    } else if (daysSinceLastCommit < 30) {
      timeAgoText = isEs ? `hace ${daysSinceLastCommit} días` : `${daysSinceLastCommit} days ago`
    } else if (daysSinceLastCommit < 365) {
      const months = Math.floor(daysSinceLastCommit / 30)
      timeAgoText = isEs ? `hace ${months} ${months === 1 ? 'mes' : 'meses'}` : `${months} ${months === 1 ? 'month' : 'months'} ago`
    } else {
      const years = (daysSinceLastCommit / 365).toFixed(1)
      timeAgoText = isEs ? `hace ${years} años` : `${years} years ago`
    }
  }

  // Factor 1: Commit Recency (max 35 pts)
  let commitScore = 5
  if (daysSinceLastCommit !== null) {
    if (daysSinceLastCommit <= 7) commitScore = 35
    else if (daysSinceLastCommit <= 30) commitScore = 30
    else if (daysSinceLastCommit <= 90) commitScore = 22
    else if (daysSinceLastCommit <= 180) commitScore = 14
    else if (daysSinceLastCommit <= 365) commitScore = 6
    else commitScore = 1
  }

  // Factor 2: Community & Issues (max 25 pts)
  let communityScore = 20
  const stars = report.repository.stars || 0
  const openIssues = report.repository.openIssues || 0
  if (stars > 1000 && openIssues < stars * 0.1) {
    communityScore = 25
  } else if (openIssues > 500 && stars < 500) {
    communityScore = 10
  } else if (stars > 50) {
    communityScore = 22
  }

  // Factor 3: Releases & Distribution (max 15 pts)
  let releaseScore = 8
  if (report.latestRelease) {
    releaseScore = 15
  }

  // Factor 4: Governance & Quality (max 25 pts)
  let governanceScore = 10
  if (report.repository?.license) governanceScore += 8
  if (typeof report.technicalSummary === 'string' && report.technicalSummary.length > 20) governanceScore += 4
  const hasSecurity = (report.importantFiles || []).some((f) => (f?.path || '').toLowerCase().includes('security.md'))
  if (hasSecurity) governanceScore += 3

  const totalScore = Math.min(100, Math.max(0, commitScore + communityScore + releaseScore + governanceScore))

  // Determine status and verdict
  let status: HealthStatus = 'active'
  let label = isEs ? 'Activo' : 'Active'
  let color = 'var(--accent-emerald)'
  let verdict = isEs
    ? `Mantenimiento constante y activo. Último cambio ${timeAgoText}.`
    : `Consistently maintained. Latest update ${timeAgoText}.`

  if (totalScore >= 75) {
    status = 'active'
    label = isEs ? 'Activo' : 'Active'
    color = 'var(--accent-emerald)'
    verdict = isEs
      ? `Proyecto con actividad reciente y saludable (${timeAgoText}).`
      : `Healthy, active project with recent updates (${timeAgoText}).`
  } else if (totalScore >= 50) {
    status = 'stable'
    label = isEs ? 'Estable' : 'Stable'
    color = 'var(--accent-cyan)'
    verdict = isEs
      ? `Código maduro y funcional, ritmo de cambios pausado (${timeAgoText}).`
      : `Mature and functional codebase with paced maintenance (${timeAgoText}).`
  } else if (totalScore >= 30) {
    status = 'low_activity'
    label = isEs ? 'Poco activo' : 'Low activity'
    color = 'var(--accent-amber)'
    verdict = isEs
      ? `Atención: Poca actividad reciente (${timeAgoText}). Verifica issues antes de usarlo en producción.`
      : `Notice: Infrequent maintenance (${timeAgoText}). Inspect open issues before production use.`
  } else {
    status = 'abandoned'
    label = isEs ? 'Inactivo / Abandonado' : 'Inactive / Abandoned'
    color = 'var(--accent-rose)'
    verdict = isEs
      ? `Alerta: Sin actualizaciones desde ${timeAgoText}. Posible librería descontinuada o abandonada.`
      : `Warning: No updates since ${timeAgoText}. Potential unmaintained or abandoned library.`
  }

  return {
    score: totalScore,
    status,
    label,
    color,
    daysSinceLastCommit,
    timeAgoText,
    verdict,
    details: {
      commitScore,
      communityScore,
      releaseScore,
      governanceScore,
    },
  }
}
