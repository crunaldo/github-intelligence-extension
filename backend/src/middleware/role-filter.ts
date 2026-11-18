import type { AnalysisResult } from '../ai/types'

export type FreeAnalysisResult = Omit<AnalysisResult, 'architectureDiagram' | 'deepAudit'>
export type FilteredAnalysisResult = AnalysisResult | FreeAnalysisResult

function cloneSummary(summary: AnalysisResult['summary']): AnalysisResult['summary'] {
  return {
    headline: summary.headline,
    whatItIs: summary.whatItIs,
    whyItMatters: summary.whyItMatters,
    practicalUse: summary.practicalUse,
    targetAudience: summary.targetAudience,
    stackPills: [...summary.stackPills]
  }
}

/**
 * Filters an analysis payload according to user tier without mutating the input.
 * Free responses omit `architectureDiagram` and `deepAudit` entirely.
 */
export function filterResponseForRole(
  data: AnalysisResult,
  isPro: boolean
): FilteredAnalysisResult {
  if (!isPro) {
    return {
      summary: cloneSummary(data.summary),
      providerUsed: data.providerUsed,
      tokensConsumed: data.tokensConsumed
    }
  }

  return {
    summary: cloneSummary(data.summary),
    architectureDiagram: data.architectureDiagram,
    deepAudit: {
      strengths: [...data.deepAudit.strengths],
      concerns: [...data.deepAudit.concerns]
    },
    providerUsed: data.providerUsed,
    tokensConsumed: data.tokensConsumed
  }
}
