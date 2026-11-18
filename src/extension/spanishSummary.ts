import type { RepositoryReport } from '../features/repository/types'
import { BackendApiError, type FilteredAnalysisResult } from './api/backendClient'
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

export interface SummaryErrorState {
  quotaExceeded: boolean
  maintenanceMode?: boolean
  errorMessage: string | null
}

function toShortDescription(text: string): string {
  const trimmed = (text || '').trim()
  if (!trimmed) return ''
  const firstSentence = trimmed.split('.')[0]?.trim() || trimmed
  return firstSentence.endsWith('.') ? firstSentence : `${firstSentence}.`
}

function buildBaseSummaryMetadata(report: RepositoryReport, locale: ActiveLocale) {
  const name = report.repository?.name || 'Repository'
  const desc = (report.repository?.description || '').trim()
  const primaryLang = report.languages?.[0]?.name || (locale === 'en' ? 'Software' : 'Código')
  const license =
    report.repository?.license?.spdxId || report.repository?.license?.name || 'Open Source'
  const ecosystem =
    report.manifests?.[0]?.ecosystem || (locale === 'en' ? 'Repository' : 'Repositorio')
  const stackPills = [primaryLang, license, ecosystem].filter(Boolean)

  const whatItIs =
    desc.length > 0
      ? desc
      : locale === 'en'
        ? `Open-source repository ${name} written primarily in ${primaryLang}.`
        : `Repositorio de código abierto ${name} desarrollado principalmente en ${primaryLang}.`

  return { name, primaryLang, stackPills, whatItIs }
}

/**
 * Maps a backend Edge Worker analysis response into the UI's ColloquialExplanation shape.
 */
export function mapAnalysisToColloquialSummary(
  analysis: FilteredAnalysisResult,
  locale: ActiveLocale = 'es'
): ColloquialExplanation {
  const s = analysis.summary
  const stackPills =
    Array.isArray(s.stackPills) && s.stackPills.length > 0 ? s.stackPills : ['Software']

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
 * Minimal neutral loading placeholder used only while thin-client AI intelligence
 * is actively loading from the Edge Worker. Contains zero proprietary heuristics.
 */
export function generateColloquialSpanishSummary(
  report: RepositoryReport,
  locale: ActiveLocale = 'es'
): ColloquialExplanation {
  const { name, stackPills, whatItIs } = buildBaseSummaryMetadata(report, locale)

  if (locale === 'en') {
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

/**
 * Static fallback summary displayed whenever backend AI intelligence fails or hits quota,
 * ensuring loading text never remains stuck on screen.
 */
export function generateFallbackSummary(
  report: RepositoryReport,
  locale: ActiveLocale = 'es'
): ColloquialExplanation {
  const { name, primaryLang, stackPills, whatItIs } = buildBaseSummaryMetadata(report, locale)

  if (locale === 'en') {
    return {
      headline: name,
      whatItIs,
      whyItMatters: `Built primarily in ${primaryLang}. Explore the repository metadata, files, and compatibility details below.`,
      practicalUse: 'Review manifests, dependencies, and installation steps below.',
      targetAudience: 'Software Developers',
      stackPills,
      shortDescription: toShortDescription(whatItIs),
    }
  }

  return {
    headline: name,
    whatItIs,
    whyItMatters: `Desarrollado principalmente en ${primaryLang}. Explora los metadatos, archivos y compatibilidad en las secciones inferiores.`,
    practicalUse: 'Revisa los manifiestos, dependencias y pasos de instalación abajo.',
    targetAudience: 'Desarrolladores de software',
    stackPills,
    shortDescription: toShortDescription(whatItIs),
  }
}

/**
 * Classifies a backend error into quota-exceeded, maintenance-mode, or transient error state.
 */
export function classifySummaryError(err: unknown): SummaryErrorState {
  if (
    err instanceof BackendApiError &&
    (err.status === 429 || err.code === 'QUOTA_EXCEEDED')
  ) {
    return {
      quotaExceeded: true,
      errorMessage: null,
    }
  }

  if (err instanceof BackendApiError && err.code === 'MAINTENANCE_MODE') {
    return {
      quotaExceeded: false,
      maintenanceMode: true,
      errorMessage: err.message || 'Service is temporarily under maintenance.',
    }
  }

  const message =
    err instanceof Error && err.message ? err.message : 'Unable to reach AI intelligence service.'

  return {
    quotaExceeded: false,
    errorMessage: message,
  }
}
