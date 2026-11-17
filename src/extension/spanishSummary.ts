import type { RepositoryReport } from '../features/repository/types'
import type { FilteredAnalysisResult } from './api/backendClient'
import type { ActiveLocale } from './i18n'

export type ColloquialExplanation = {
  headline: string
  whatItIs: string
  whyItMatters: string
  practicalUse: string
  targetAudience: string
  stackPills: string[]
  shortDescription: string
}

function toShortDescription(text: string): string {
  const trimmed = (text || '').trim()
  if (!trimmed) return ''
  const firstSentence = trimmed.split('.')[0]?.trim() || trimmed
  return firstSentence.endsWith('.') ? firstSentence : `${firstSentence}.`
}

/**
 * Maps a backend Edge Worker analysis response into the UI's ColloquialExplanation shape.
 */
export function mapAnalysisToColloquialSummary(
  analysis: FilteredAnalysisResult,
  locale: ActiveLocale = 'es'
): ColloquialExplanation {
  const s = analysis.summary
  const fallbackPill = locale === 'en' ? 'Software' : 'Software'
  const stackPills =
    Array.isArray(s.stackPills) && s.stackPills.length > 0 ? s.stackPills : [fallbackPill]

  return {
    headline: s.headline,
    whatItIs: s.whatItIs,
    whyItMatters: s.whyItMatters,
    practicalUse: s.practicalUse,
    targetAudience: s.targetAudience,
    stackPills,
    shortDescription: toShortDescription(s.whatItIs),
  }
}

/**
 * Minimal neutral fallback/loading placeholder used while thin-client AI intelligence
 * loads from the Edge Worker or when offline. Contains zero proprietary heuristics.
 */
export function generateColloquialSpanishSummary(
  report: RepositoryReport,
  locale: ActiveLocale = 'es'
): ColloquialExplanation {
  const name = report.repository?.name || 'Repository'
  const desc = (report.repository?.description || '').trim()
  const primaryLang = report.languages?.[0]?.name || (locale === 'en' ? 'Software' : 'Código')
  const license =
    report.repository?.license?.spdxId || report.repository?.license?.name || 'Open Source'
  const ecosystem =
    report.manifests?.[0]?.ecosystem || (locale === 'en' ? 'Repository' : 'Repositorio')
  const stackPills = [primaryLang, license, ecosystem].filter(Boolean)

  if (locale === 'en') {
    const whatItIs =
      desc.length > 0
        ? desc
        : `Open-source repository ${name} written primarily in ${primaryLang}.`

    return {
      headline: name,
      whatItIs,
      whyItMatters: 'Fetching AI architecture and impact insights...',
      practicalUse: 'Review manifests, dependencies, and installation steps below.',
      targetAudience: 'Software Developers',
      stackPills,
      shortDescription: toShortDescription(whatItIs),
    }
  }

  const whatItIs =
    desc.length > 0
      ? desc
      : `Repositorio de código abierto ${name} desarrollado principalmente en ${primaryLang}.`

  return {
    headline: name,
    whatItIs,
    whyItMatters: 'Obteniendo análisis de impacto y arquitectura con IA...',
    practicalUse: 'Revisa los manifiestos, dependencias y pasos de instalación abajo.',
    targetAudience: 'Desarrolladores de software',
    stackPills,
    shortDescription: toShortDescription(whatItIs),
  }
}
