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

          <h3 className="ext-modal-title">
            Actualización Requerida
          </h3>

          <p className="ext-modal-desc" style={{ marginBottom: 16 }}>
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
            <span className="ext-modal-badge">
              v{whatsNew.version || CURRENT_EXTENSION_VERSION}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {whatsNew.releaseDate}
            </span>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="ext-modal-close-btn"
            title="Cerrar modal"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Hero Title */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div className="ext-modal-hero-icon">
            <Sparkles size={24} />
          </div>
          <h3 className="ext-modal-title">
            {whatsNew.title || '¡Novedades en GitHub Intelligence!'}
          </h3>
          <p className="ext-modal-desc">
            {whatsNew.summary || (whatsNew as any).description}
          </p>
        </div>

        {/* Highlights List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          {(whatsNew.highlights || []).map((h) => (
            <div key={h.id} className="ext-modal-highlight">
              <div className="ext-modal-highlight-icon">
                {h.icon === 'zap' ? (
                  <Zap size={14} />
                ) : h.icon === 'shield' ? (
                  <ShieldAlert size={14} />
                ) : (
                  <Sparkles size={14} />
                )}
              </div>
              <div>
                <h5 className="ext-modal-highlight-title">
                  {h.title}
                </h5>
                {h.description ? (
                  <p className="ext-modal-highlight-desc">
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
              className="ext-modal-blog-link"
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
