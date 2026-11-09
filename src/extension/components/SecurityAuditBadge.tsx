import { useState, useEffect } from 'react'
import {
  ShieldCheck,
  AlertTriangle,
  ShieldAlert,
  ExternalLink,
  X,
  RefreshCw,
} from 'lucide-react'
import type { RepositoryReport } from '../../features/repository/types'
import { auditRepositorySecurity, type SecurityAuditResult } from '../../features/repository/security'
import type { ActiveLocale } from '../i18n'

type SecurityAuditBadgeProps = {
  report: RepositoryReport
  locale?: ActiveLocale
}

export function SecurityAuditBadge({ report, locale = 'es' }: SecurityAuditBadgeProps) {
  const isEs = locale === 'es'
  const [audit, setAudit] = useState<SecurityAuditResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    let isMounted = true
    setLoading(true)
    void auditRepositorySecurity(report)
      .then((res) => {
        if (isMounted) {
          setAudit(res)
          setLoading(false)
        }
      })
      .catch(() => {
        if (isMounted) {
          setLoading(false)
        }
      })
    return () => {
      isMounted = false
    }
  }, [report?.repository?.fullName])

  if (loading || !audit) {
    return (
      <span className="repo-security-badge badge-loading">
        <RefreshCw size={11} className="animate-spin" />
        <span>{isEs ? 'Auditando CVEs...' : 'Auditing CVEs...'}</span>
      </span>
    )
  }

  const advisoriesList = Array.isArray(audit.advisories) ? audit.advisories : []
  const isSafe = (audit.totalVulnerabilities || 0) === 0 && advisoriesList.length === 0
  const isCritical = audit.status === 'critical'

  return (
    <>
      <button
        type="button"
        className={`repo-security-badge ${isSafe ? 'badge-safe' : isCritical ? 'badge-critical' : 'badge-warning'}`}
        onClick={() => setShowModal(true)}
        title={isEs ? 'Ver auditoría de seguridad y CVEs en tiempo real' : 'View real-time security & CVE audit'}
      >
        {isSafe ? (
          <ShieldCheck size={12} className="security-icon-safe" />
        ) : (
          <ShieldAlert size={12} className="security-icon-alert" />
        )}
        <span>
          {isSafe
            ? isEs
              ? '0 vulnerabilidades conocidas'
              : '0 known vulnerabilities'
            : isEs
            ? `${audit.totalVulnerabilities} alertas CVE en dependencias`
            : `${audit.totalVulnerabilities} CVE alerts in dependencies`}
        </span>
      </button>

      {/* Security Details Modal */}
      {showModal && (
        <div className="ext-settings-modal-overlay" onClick={() => setShowModal(false)}>
          <div
            className="ext-settings-modal-card"
            style={{ maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ext-settings-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }}>
                <ShieldCheck size={16} style={{ color: isSafe ? 'var(--accent-emerald)' : 'var(--accent-rose)' }} />
                <span>{isEs ? 'Auditoría de Seguridad & CVEs' : 'Security & CVE Audit'}</span>
              </div>
              <button type="button" className="ext-btn-icon" onClick={() => setShowModal(false)}>
                <X size={14} />
              </button>
            </div>

            <div className="ext-settings-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Status Header Banner */}
              <div
                style={{
                  padding: 10,
                  borderRadius: 'var(--radius-sm)',
                  background: isSafe ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
                  border: `1px solid ${isSafe ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                  color: isSafe ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {isSafe ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}
                <div>
                  <strong>
                    {isSafe
                      ? isEs
                        ? 'Repositorio Seguro (Sin CVEs Conocidos)'
                        : 'Safe Repository (No Known CVEs)'
                      : isEs
                      ? 'Atención: Vulnerabilidades Detectadas'
                      : 'Warning: Vulnerabilities Detected'}
                  </strong>
                  <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>
                    {isEs
                      ? `Se auditaron ${audit.auditedPackagesCount} paquetes contra la base de datos de Open Source Vulnerabilities (OSV.dev).`
                      : `Audited ${audit.auditedPackagesCount} packages against the Open Source Vulnerabilities (OSV.dev) database.`}
                  </div>
                </div>
              </div>

              {/* Policy & Checklist */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="insight-card" style={{ padding: 10 }}>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                    {isEs ? 'Política de Seguridad' : 'Security Policy'}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: audit.hasSecurityPolicy ? 'var(--accent-emerald)' : 'var(--text-secondary)', marginTop: 3 }}>
                    {audit.hasSecurityPolicy ? (isEs ? '✓ SECURITY.md presente' : '✓ SECURITY.md present') : (isEs ? 'Sin SECURITY.md' : 'No SECURITY.md')}
                  </div>
                </div>

                <div className="insight-card" style={{ padding: 10 }}>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                    {isEs ? 'Base de Datos' : 'Audit Engine'}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-cyan)', marginTop: 3 }}>
                    OSV.dev / GHSA
                  </div>
                </div>
              </div>

              {/* Vulnerabilities List */}
              {advisoriesList.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
                    {isEs ? 'Vulnerabilidades Reportadas:' : 'Reported Vulnerabilities:'}
                  </div>
                  {advisoriesList.map((adv) => (
                    <div
                      key={adv.id}
                      style={{
                        padding: '8px 10px',
                        background: 'var(--bg-surface-elevated)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: 11.5,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          {adv.packageName ? `📦 ${adv.packageName}` : adv.id}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            padding: '1px 6px',
                            borderRadius: 4,
                            fontWeight: 700,
                            background: adv.severity === 'CRITICAL' ? 'rgba(244, 63, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                            color: adv.severity === 'CRITICAL' ? 'var(--accent-rose)' : 'var(--accent-amber)',
                          }}
                        >
                          {adv.severity}
                        </span>
                      </div>
                      <p style={{ margin: '4px 0', color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.4 }}>
                        {adv.title}
                      </p>
                      {adv.url && (
                        <a
                          href={adv.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--accent-cyan)', fontSize: 10.5, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                        >
                          {adv.cveId || adv.id} <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45, padding: '4px 2px' }}>
                  {isEs
                    ? 'No se encontraron avisos de seguridad críticos ni vulnerabilidades activas en las dependencias declaradas del proyecto.'
                    : 'No critical security advisories or known active CVEs found in the project declared dependencies.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
