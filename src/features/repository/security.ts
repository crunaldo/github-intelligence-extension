// Security & CVE Audit Engine for GitHub Repositories
// Checks GitHub Security Advisories and OSV.dev (Open Source Vulnerabilities) API

import type { RepositoryReport } from './types'

export type SecurityAdvisoryItem = {
  id: string
  title: string
  severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN'
  packageName?: string
  cveId?: string
  url?: string
}

export type SecurityAuditResult = {
  totalVulnerabilities: number
  hasSecurityPolicy: boolean
  status: 'safe' | 'warning' | 'critical'
  advisories: SecurityAdvisoryItem[]
  auditedPackagesCount: number
  source: 'osv' | 'github' | 'clean'
}

// In-memory cache for security audit results to prevent repeated network requests
const securityAuditCache = new Map<string, { timestamp: number; result: SecurityAuditResult }>()
const CACHE_TTL_MS = 1000 * 60 * 30 // 30 minutes

function mapEcosystem(dependencyType?: string, primaryLanguage?: string): string {
  const dt = (dependencyType || '').toLowerCase()
  const pl = (primaryLanguage || '').toLowerCase()

  if (dt.includes('npm') || dt.includes('node') || dt.includes('package.json') || pl.includes('typescript') || pl.includes('javascript')) {
    return 'npm'
  }
  if (dt.includes('pypi') || dt.includes('pip') || dt.includes('requirements') || pl.includes('python')) {
    return 'PyPI'
  }
  if (dt.includes('cargo') || dt.includes('rust') || pl.includes('rust')) {
    return 'crates.io'
  }
  if (dt.includes('go') || pl.includes('go')) {
    return 'Go'
  }
  if (dt.includes('composer') || pl.includes('php')) {
    return 'Packagist'
  }
  if (dt.includes('maven') || pl.includes('java') || pl.includes('kotlin')) {
    return 'Maven'
  }
  if (dt.includes('nuget') || pl.includes('c#') || pl.includes('.net')) {
    return 'NuGet'
  }
  if (dt.includes('gem') || pl.includes('ruby')) {
    return 'RubyGems'
  }

  return 'npm'
}

export async function auditRepositorySecurity(
  report: RepositoryReport,
  signal?: AbortSignal
): Promise<SecurityAuditResult> {
  const repoName = report.repository?.fullName || 'unknown'
  const cacheKey = repoName.toLowerCase()
  const cached = securityAuditCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result
  }

  const advisories: SecurityAdvisoryItem[] = []
  const hasSecurityPolicy = Boolean(
    report.importantFiles?.some((f) => (f?.path || '').toLowerCase().includes('security.md'))
  )

  const dependencies = Array.isArray(report.dependencies) ? report.dependencies : []
  const primaryLang = report.languages?.[0]?.name || ''

  // 1. Check OSV.dev Batch API for dependencies if dependencies exist
  if (dependencies.length > 0) {
    try {
      // Check top 25 valid packages to stay within fast, responsive limit
      const packagesToCheck = dependencies.filter((d) => d && d.name).slice(0, 25)
      const queries = packagesToCheck.map((dep) => ({
        package: {
          name: dep.name,
          ecosystem: mapEcosystem(dep.kind || dep.manifest, primaryLang),
        },
      }))

      if (queries.length > 0) {
        const osvResponse = await fetch('https://api.osv.dev/v1/querybatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queries }),
          signal: signal ? AbortSignal.timeout(5000) : undefined,
        })

        if (osvResponse.ok) {
          const osvData = await osvResponse.json()
          if (Array.isArray(osvData.results)) {
            osvData.results.forEach((res: any, idx: number) => {
              const pkgName = packagesToCheck[idx]?.name || 'unknown'
              if (res && Array.isArray(res.vulns)) {
                for (const v of res.vulns.slice(0, 3)) {
                  let severity: SecurityAdvisoryItem['severity'] = 'MODERATE'
                  if (v?.database_specific?.severity) {
                    const s = String(v.database_specific.severity).toUpperCase()
                    if (s.includes('CRIT')) severity = 'CRITICAL'
                    else if (s.includes('HIGH')) severity = 'HIGH'
                    else if (s.includes('LOW')) severity = 'LOW'
                  }

                  const cveAlias = Array.isArray(v?.aliases) ? v.aliases.find((a: string) => typeof a === 'string' && a.startsWith('CVE-')) : undefined

                  advisories.push({
                    id: v?.id || cveAlias || `GHSA-${Math.random().toString(36).slice(2, 7)}`,
                    title: v?.summary || (typeof v?.details === 'string' ? v.details.slice(0, 90) : `Vulnerabilidad en ${pkgName}`),
                    severity,
                    packageName: pkgName,
                    cveId: cveAlias,
                    url: v?.references?.[0]?.url || `https://osv.dev/vulnerability/${v?.id}`,
                  })
                }
              }
            })
          }
        }
      }
    } catch (err) {
      // Non-blocking fallback
      console.warn('OSV.dev security audit request error:', err)
    }
  }

  // Determine overall status
  const totalVulnerabilities = advisories.length
  let status: SecurityAuditResult['status'] = 'safe'
  if (totalVulnerabilities > 0) {
    const hasCritical = advisories.some((a) => a.severity === 'CRITICAL' || a.severity === 'HIGH')
    status = hasCritical ? 'critical' : 'warning'
  }

  const result: SecurityAuditResult = {
    totalVulnerabilities,
    hasSecurityPolicy,
    status,
    advisories: advisories || [],
    auditedPackagesCount: Math.min(dependencies.length, 25),
    source: advisories.length > 0 ? 'osv' : 'clean',
  }

  securityAuditCache.set(cacheKey, { timestamp: Date.now(), result })
  return result
}
