import React, { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ExternalLink,
  Rocket,
  ShieldAlert,
  Sparkles,
  X,
  Zap
} from 'lucide-react'
import type { ExtensionReleaseConfig } from '../api/backendClient'

const CURRENT_EXTENSION_VERSION = '1.4.0'
const STORAGE_KEY_SEEN_WHATS_NEW = 'gpi_whats_new_seen_version'

export interface WhatsNewModalProps {
  releaseConfig?: ExtensionReleaseConfig
  forceOpen?: boolean
  onClose?: () => void
}

export function WhatsNewModal({ releaseConfig, forceOpen = false, onClose }: WhatsNewModalProps) {
  const [isOpen, setIsOpen] = useState(false)

  const whatsNew = releaseConfig?.whatsNew
  const forceUpdate = releaseConfig?.forceUpdateNotice

  // Check if force update is needed (e.g. minSupportedVersion > current)
  const isForceUpdateRequired = Boolean(
    forceUpdate &&
      releaseConfig?.minSupportedVersion &&
      releaseConfig.minSupportedVersion > CURRENT_EXTENSION_VERSION
  )

  useEffect(() => {
    if (forceOpen) {
      setIsOpen(true)
      return
    }

    if (isForceUpdateRequired) {
      setIsOpen(true)
      return
    }

    if (!whatsNew || !whatsNew.enabled) {
      return
    }

    try {
      const seenVersion = localStorage.getItem(STORAGE_KEY_SEEN_WHATS_NEW)
      const targetVersion = whatsNew.version || CURRENT_EXTENSION_VERSION
      if (seenVersion !== targetVersion) {
        setIsOpen(true)
      }
    } catch {
      // ignore
    }
  }, [forceOpen, whatsNew, isForceUpdateRequired])

  const handleDismiss = () => {
    if (isForceUpdateRequired) return // Cannot dismiss if critical update enforced

    setIsOpen(false)
    if (whatsNew?.version) {
      try {
        localStorage.setItem(STORAGE_KEY_SEEN_WHATS_NEW, whatsNew.version)
      } catch {
        // ignore
      }
    }
    onClose?.()
  }

  if (!isOpen) return null

  // Render Force Update Barrier
  if (isForceUpdateRequired) {
    return (
      <div className="ext-modal-overlay animate-fade-in" style={{ zIndex: 99999 }}>
        <div className="ext-modal-card" style={{ maxWidth: 380, textAlign: 'center' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: 'rgba(244, 63, 94, 0.15)',
              color: '#f43f5e',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12
            }}
          >
            <ShieldAlert size={28} />
          </div>

          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 6px 0' }}>
            Actualización Requerida
          </h3>

          <p style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.5, marginBottom: 16 }}>
            {releaseConfig?.forceUpdateMessage ||
              'Esta versión de la extensión ha sido deprecada. Por favor actualiza a la versión más reciente en Chrome Web Store para continuar.'}
          </p>

          <a
            href={releaseConfig?.updateUrl || 'https://chromewebstore.google.com'}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              padding: '10px 16px',
              borderRadius: 12,
              background: '#f43f5e',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              boxShadow: '0 4px 12px rgba(244, 63, 94, 0.3)'
            }}
          >
            <Rocket size={16} />
            <span>Actualizar a v{releaseConfig?.latestVersion || '1.4.0'}</span>
          </a>
        </div>
      </div>
    )
  }

  if (!whatsNew) return null

  return (
    <div className="ext-modal-overlay animate-fade-in" style={{ zIndex: 9999 }}>
      <div className="ext-modal-card" style={{ maxWidth: 420 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'rgba(99, 102, 241, 0.2)',
                color: '#818cf8',
                border: '1px solid rgba(99, 102, 241, 0.35)'
              }}
            >
              v{whatsNew.version || CURRENT_EXTENSION_VERSION}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary, #94a3b8)' }}>
              {whatsNew.releaseDate}
            </span>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary, #94a3b8)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 8
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Hero Title */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              background: 'rgba(99, 102, 241, 0.15)',
              color: '#818cf8',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 8
            }}
          >
            <Sparkles size={24} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 6px 0' }}>
            {whatsNew.title || '¡Novedades en GitHub Intelligence!'}
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.5, margin: 0 }}>
            {whatsNew.summary || (whatsNew as any).description}
          </p>
        </div>

        {/* Highlights List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          {(whatsNew.highlights || []).map((h) => (
            <div
              key={h.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 12,
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: '#818cf8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                {h.icon === 'zap' ? (
                  <Zap size={14} />
                ) : h.icon === 'shield' ? (
                  <ShieldAlert size={14} />
                ) : (
                  <Sparkles size={14} />
                )}
              </div>
              <div>
                <h5 style={{ fontSize: 12, fontWeight: 600, color: '#fff', margin: '0 0 2px 0' }}>
                  {h.title}
                </h5>
                {h.description ? (
                  <p style={{ fontSize: 11, color: 'var(--text-secondary, #94a3b8)', margin: 0, lineHeight: 1.4 }}>
                    {h.description}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={handleDismiss}
            style={{
              width: '100%',
              padding: '10px 16px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)'
            }}
          >
            {whatsNew.ctaText || '¡Entendido, Explorar!'}
          </button>

          {whatsNew.blogUrl && (
            <a
              href={whatsNew.blogUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                fontSize: 11,
                color: '#818cf8',
                textDecoration: 'none',
                marginTop: 2
              }}
            >
              <span>Ver notas de la versión completas</span>
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
