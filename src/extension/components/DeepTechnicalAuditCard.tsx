import { ShieldCheck, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react'
import type { RepositoryReport } from '../../features/repository/types'
import type { ActiveLocale } from '../i18n'

type Props = {
  report: RepositoryReport
  locale?: ActiveLocale
}

export function DeepTechnicalAuditCard({ report, locale = 'es' }: Props) {
  const isEs = locale === 'es'
  const deepAudit = report.aiAnalysis?.deepAudit
  const isLoadingAi = !report.aiAnalysis

  // If AI completed and there are no strengths or concerns, don't show an empty card
  if (!isLoadingAi && (!deepAudit || (deepAudit.strengths.length === 0 && deepAudit.concerns.length === 0))) {
    return null
  }

  return (
    <div className="insight-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ShieldCheck size={16} style={{ color: 'var(--accent-emerald)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            {isEs ? 'Auditoría Técnica Profunda' : 'Deep Technical Audit'}
          </span>
        </div>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: 9999,
            background: 'rgba(46, 160, 67, 0.15)',
            color: '#2ea043',
            border: '1px solid rgba(46, 160, 67, 0.3)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {isEs ? 'Auditoría IA' : 'AI Audit'}
        </span>
      </div>

      {isLoadingAi ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '12px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px dashed var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={13} style={{ color: 'var(--accent-emerald)' }} className="animate-pulse" />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {isEs ? 'Auditoría de fortalezas y riesgos en progreso...' : 'Audit of strengths and trade-offs in progress...'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            <div
              style={{
                height: 12,
                borderRadius: 4,
                width: '85%',
                background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 75%)',
                backgroundSize: '200% 100%',
                animation: 'skeleton-shimmer 1.8s infinite',
              }}
            />
            <div
              style={{
                height: 12,
                borderRadius: 4,
                width: '65%',
                background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 75%)',
                backgroundSize: '200% 100%',
                animation: 'skeleton-shimmer 1.8s infinite',
              }}
            />
          </div>
        </div>
      ) : (
        <>
          {deepAudit && deepAudit.strengths.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-emerald)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {isEs ? 'Fortalezas Clave' : 'Key Strengths'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {deepAudit.strengths.map((item, idx) => (
                  <div
                    key={`strength-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 7,
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      lineHeight: 1.45,
                    }}
                  >
                    <CheckCircle2 size={13} style={{ color: 'var(--accent-emerald)', flexShrink: 0, marginTop: 2 }} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {deepAudit && deepAudit.concerns.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-amber)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {isEs ? 'Riesgos & Puntos de Atención' : 'Concerns & Trade-offs'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {deepAudit.concerns.map((item, idx) => (
                  <div
                    key={`concern-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 7,
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      lineHeight: 1.45,
                    }}
                  >
                    <AlertTriangle size={13} style={{ color: 'var(--accent-amber)', flexShrink: 0, marginTop: 2 }} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
