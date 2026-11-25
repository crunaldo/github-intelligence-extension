import React, { useEffect, useState } from 'react'
import { Sparkles, X, CheckCircle, Layers, Crown, AlertTriangle } from 'lucide-react'
import {
  explainFileWithAi,
  type FileExplanation,
} from '../utils/fileExplanationService'
import { t, type ActiveLocale } from '../i18n'

export interface FileAiExplainerPopoverProps {
  filePath: string
  owner: string
  repo: string
  ref?: string
  isPro: boolean
  locale?: ActiveLocale
  onClose: () => void
  onUpgradeToPro?: () => void
}

export function FileAiExplainerPopover({
  filePath,
  owner,
  repo,
  ref,
  isPro,
  locale = 'es',
  onClose,
  onUpgradeToPro,
}: FileAiExplainerPopoverProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [explanation, setExplanation] = useState<FileExplanation | null>(null)
  const [remaining, setRemaining] = useState<number>(isPro ? Infinity : 3)

  const fileName = filePath.split('/').pop() || filePath

  useEffect(() => {
    let isMounted = true
    setLoading(true)
    setError(null)

    explainFileWithAi({
      owner,
      repo,
      path: filePath,
      ref,
      isPro,
    })
      .then((res) => {
        if (!isMounted) return
        setExplanation(res.explanation)
        setRemaining(res.remainingToday)
        setLoading(false)
      })
      .catch((err) => {
        if (!isMounted) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [owner, repo, filePath, ref, isPro])

  return (
    <div
      style={{
        width: 320,
        background: 'var(--gpi-bg, #0d1117)',
        border: '1px solid var(--gpi-border, #30363d)',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
        padding: 12,
        zIndex: 1000,
        fontSize: 12,
        color: 'var(--gpi-text, #e6edf3)',
        pointerEvents: 'auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--gpi-border, #30363d)',
          paddingBottom: 8,
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          <Sparkles size={14} style={{ color: 'var(--gpi-accent, #FF2F5A)' }} />
          <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fileName}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--gpi-text-muted, #8b949e)',
            cursor: 'pointer',
            padding: 2,
            display: 'flex',
          }}
          title={t('explainer_close', locale)}
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      {loading && (
        <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--gpi-text-muted, #8b949e)' }}>
          <Sparkles size={18} style={{ animation: 'spin 2s linear infinite', color: 'var(--gpi-accent, #FF2F5A)', marginBottom: 6 }} />
          <div>{t('explainer_analyzing', locale)}</div>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: 10,
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444', fontWeight: 600, marginBottom: 4 }}>
            <AlertTriangle size={14} />
            <span>
              {error.toLowerCase().includes('cuota') || error.toLowerCase().includes('límite') || error.toLowerCase().includes('quota') || error.toLowerCase().includes('limit')
                ? t('explainer_daily_limit', locale)
                : t('explainer_unavailable', locale)}
            </span>
          </div>
          <p style={{ margin: '0 0 8px 0', fontSize: 11, color: 'var(--gpi-text-muted, #8b949e)' }}>{error}</p>
          {(error.toLowerCase().includes('cuota') || error.toLowerCase().includes('límite') || error.toLowerCase().includes('quota') || error.toLowerCase().includes('limit')) && (
            <button
              type="button"
              onClick={onUpgradeToPro}
              style={{
                width: '100%',
                padding: '6px 10px',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 4,
                fontWeight: 600,
                fontSize: 11,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              <Crown size={12} />
              <span>{t('explainer_upgrade_pro', locale)}</span>
            </button>
          )}
        </div>
      )}

      {!loading && !error && explanation && (
        <div>
          {/* Summary */}
          <p style={{ margin: '0 0 8px 0', lineHeight: 1.4 }}>{explanation.summary}</p>

          {/* Responsibilities */}
          {explanation.keyResponsibilities && explanation.keyResponsibilities.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', color: 'var(--gpi-text-muted, #8b949e)', fontWeight: 600, marginBottom: 4 }}>
                {t('explainer_responsibilities', locale)}
              </div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {explanation.keyResponsibilities.map((resp, idx) => (
                  <li key={idx} style={{ marginBottom: 3, fontSize: 11.5 }}>
                    {resp}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Architecture Role */}
          {explanation.architectureRole && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                background: 'var(--gpi-bg-secondary, #161b22)',
                borderRadius: 4,
                marginBottom: 8,
                fontSize: 11,
              }}
            >
              <Layers size={13} style={{ color: 'var(--gpi-accent, #FF2F5A)' }} />
              <span style={{ color: 'var(--gpi-text-muted, #8b949e)' }}>{locale === 'es' ? 'Rol:' : 'Role:'}</span>
              <strong style={{ color: 'var(--gpi-text, #e6edf3)' }}>{explanation.architectureRole}</strong>
            </div>
          )}

          {/* Footer Quota info */}
          <div
            style={{
              borderTop: '1px solid var(--gpi-border, #30363d)',
              paddingTop: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 10.5,
              color: 'var(--gpi-text-muted, #8b949e)',
            }}
          >
            {isPro ? (
              <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                <Crown size={11} />{' '}
                {remaining !== Infinity && remaining !== undefined
                  ? locale === 'es'
                    ? `PRO: ${remaining} restantes hoy`
                    : `PRO: ${remaining} left today`
                  : locale === 'es'
                    ? 'PRO Ilimitado'
                    : 'PRO Unlimited'}
              </span>
            ) : (
              <span>
                {locale === 'es'
                  ? `${remaining} consultas gratuitas hoy`
                  : `${remaining} free queries today`}
              </span>
            )}
            <span style={{ opacity: 0.8 }}>Powered by AI</span>
          </div>
        </div>
      )}
    </div>
  )
}
