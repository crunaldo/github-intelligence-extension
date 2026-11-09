import { useState } from 'react'
import { ShieldCheck, ShieldAlert, AlertTriangle, X, Check, ExternalLink, HelpCircle, FileText } from 'lucide-react'
import type { RepositoryReport } from '../../features/repository/types'
import { analyzeRepositoryLicense, type LicenseAnalysis } from '../../features/repository/license'
import type { ActiveLocale } from '../i18n'

type LicenseBadgeProps = {
  report: RepositoryReport
  locale?: ActiveLocale
}

export function LicenseBadge({ report, locale = 'es' }: LicenseBadgeProps) {
  const isEs = locale === 'es'
  const [showModal, setShowModal] = useState(false)
  const analysis: LicenseAnalysis = analyzeRepositoryLicense(report.repository.license, locale)

  const isPermissive = analysis.verdictType === 'permissive'
  const isCopyleft = analysis.verdictType === 'copyleft'

  const badgeColor = isPermissive ? 'var(--accent-emerald)' : isCopyleft ? 'var(--accent-amber)' : 'var(--accent-rose)'

  return (
    <>
      <button
        type="button"
        className="repo-branch-pill repo-license-clickable-pill"
        style={{
          cursor: 'pointer',
          color: badgeColor,
          borderColor: `${badgeColor}40`,
          background: 'var(--bg-surface-elevated)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          transition: 'all 0.15s ease',
        }}
        onClick={() => setShowModal(true)}
        title={isEs ? 'Clic para ver veredicto de licencia y uso comercial' : 'Click to view license & commercial use verdict'}
      >
        {isPermissive ? (
          <ShieldCheck size={11} style={{ color: badgeColor }} />
        ) : isCopyleft ? (
          <AlertTriangle size={11} style={{ color: badgeColor }} />
        ) : (
          <ShieldAlert size={11} style={{ color: badgeColor }} />
        )}
        <span style={{ fontWeight: 700 }}>{report.repository.license?.name || analysis.name}</span>
        <span style={{ fontSize: 9.5, opacity: 0.8, borderLeft: '1px solid var(--border-subtle)', paddingLeft: 4 }}>
          {analysis.canUseCommercially ? (isEs ? 'Comercial ✓' : 'Commercial ✓') : (isEs ? 'Restringido' : 'Restricted')}
        </span>
      </button>

      {showModal && (
        <div className="ext-settings-modal-overlay" onClick={() => setShowModal(false)}>
          <div
            className="ext-settings-modal-card"
            style={{ maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="ext-settings-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }}>
                <ShieldCheck size={16} style={{ color: badgeColor }} />
                <span>{isEs ? 'Auditoría de Licencia & Uso Comercial' : 'License & Commercial Use Audit'}</span>
              </div>
              <button
                type="button"
                className="ext-btn-icon"
                onClick={() => setShowModal(false)}
                title={isEs ? 'Cerrar' : 'Close'}
              >
                <X size={14} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="ext-settings-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Verdict Header Card */}
              <div
                style={{
                  padding: 12,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-surface-elevated)',
                  border: `1px solid ${badgeColor}40`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-sm)',
                      background: `${badgeColor}20`,
                      color: badgeColor,
                      border: `1px solid ${badgeColor}50`,
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                    }}
                  >
                    {analysis.verdictBadge}
                  </span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    SPDX: {analysis.spdxId}
                  </span>
                </div>

                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>
                  {analysis.title}
                </div>

                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {analysis.explanation}
                </p>
              </div>

              {/* 3 Columns: Permisos / Condiciones / Limitaciones */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Permisos */}
                <div className="insight-card" style={{ padding: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                    <Check size={13} />
                    <span>{isEs ? 'Permisos Principales' : 'Key Permissions'}</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {analysis.permissions.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>

                {/* Condiciones */}
                <div className="insight-card" style={{ padding: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: isCopyleft ? 'var(--accent-amber)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                    <AlertTriangle size={13} style={{ color: isCopyleft ? 'var(--accent-amber)' : 'var(--text-muted)' }} />
                    <span>{isEs ? 'Condiciones Obligatorias' : 'Required Conditions'}</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {analysis.conditions.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>

                {/* Limitaciones */}
                <div className="insight-card" style={{ padding: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                    <HelpCircle size={13} />
                    <span>{isEs ? 'Limitaciones Legales' : 'Legal Limitations'}</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {analysis.limitations.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Direct links */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                {report.repository.license?.url ? (
                  <a
                    href={report.repository.license.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 11, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                  >
                    <FileText size={11} />
                    <span>{isEs ? 'Ver texto completo de la licencia' : 'View full license text'}</span>
                    <ExternalLink size={10} />
                  </a>
                ) : (
                  <span />
                )}
                <a
                  href={`https://choosealicense.com/licenses/${analysis.spdxId.toLowerCase()}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}
                >
                  <span>choosealicense.com</span>
                  <ExternalLink size={10} />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
