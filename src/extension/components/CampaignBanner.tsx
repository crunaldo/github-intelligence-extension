import { useState, useMemo } from 'react'
import { ArrowRight, Check, Tag, X } from 'lucide-react'
import type { CampaignBannerItem } from '../api/backendClient'

export interface CampaignBannerProps {
  banner: CampaignBannerItem | null | undefined
  onOpenPricing?: () => void
}

export function CampaignBanner({ banner, onOpenPricing }: CampaignBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const [copied, setCopied] = useState(false)

  const isDismissed = useMemo(() => {
    if (dismissed || !banner) return true
    try {
      const raw = sessionStorage.getItem('gpi_dismissed_banners')
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>
        return Boolean(parsed[banner.id])
      }
    } catch {
      // ignore
    }
    return false
  }, [dismissed, banner])

  if (!banner || isDismissed) {
    return null
  }

  const handleDismiss = () => {
    setDismissed(true)
    try {
      const raw = sessionStorage.getItem('gpi_dismissed_banners')
      const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
      parsed[banner.id] = true
      sessionStorage.setItem('gpi_dismissed_banners', JSON.stringify(parsed))
    } catch {
      // ignore
    }
  }

  const handleCopyCoupon = () => {
    if (!banner.couponCode) return
    void navigator.clipboard?.writeText(banner.couponCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="ext-campaign-banner" role="complementary" aria-label="Aviso de Campaña">
      <button
        type="button"
        className="ext-campaign-dismiss"
        onClick={handleDismiss}
        title="Ocultar aviso"
        aria-label="Cerrar aviso"
      >
        <X size={12} />
      </button>

      <div className="ext-campaign-header">
        {banner.badge && <span className="ext-campaign-badge">{banner.badge}</span>}
        <span className="ext-campaign-title">{banner.title}</span>
      </div>

      {banner.message && <p className="ext-campaign-desc">{banner.message}</p>}

      <div className="ext-campaign-actions">
        {banner.couponCode ? (
          <button
            type="button"
            className="ext-campaign-coupon"
            onClick={handleCopyCoupon}
            title="Copiar cupón de descuento"
          >
            <Tag size={11} />
            <span>{copied ? '¡Copiado!' : banner.couponCode}</span>
            {copied && <Check size={11} />}
          </button>
        ) : (
          <div />
        )}

        <a
          href={banner.ctaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ext-campaign-cta"
          onClick={() => {
            if (onOpenPricing && (banner.ctaUrl.includes('pricing') || banner.ctaUrl.includes('pro'))) {
              onOpenPricing()
            }
          }}
        >
          <span>{banner.ctaText}</span>
          <ArrowRight size={11} />
        </a>
      </div>
    </div>
  )
}
