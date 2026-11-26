// @vitest-environment happy-dom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { CampaignBanner } from './CampaignBanner'
import type { CampaignBannerItem } from '../api/backendClient'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const sampleBanner: CampaignBannerItem = {
  id: 'promo-2026',
  title: 'Descuento Especial de Lanzamiento',
  message: '50% de descuento en planes Pro anuales',
  badge: 'OFERTA',
  targetTier: 'all',
  ctaText: 'Ver Planes',
  ctaUrl: 'https://example.com/pricing',
  couponCode: 'LAUNCH50',
  enabled: true,
}

describe('CampaignBanner Component', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('renders banner title, message, badge and coupon', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(<CampaignBanner banner={sampleBanner} />)
    })

    expect(container.textContent).toContain('Descuento Especial de Lanzamiento')
    expect(container.textContent).toContain('50% de descuento en planes Pro anuales')
    expect(container.textContent).toContain('OFERTA')
    expect(container.textContent).toContain('LAUNCH50')
    expect(container.textContent).toContain('Ver Planes')
  })

  it('does not render if banner is null or undefined', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(<CampaignBanner banner={null} />)
    })

    expect(container.firstChild).toBeNull()
  })

  it('hides the banner when dismiss button is clicked and stores in sessionStorage', async () => {
    const root = createRoot(container)
    await React.act(async () => {
      root.render(<CampaignBanner banner={sampleBanner} />)
    })

    const dismissBtn = container.querySelector('.ext-campaign-dismiss') as HTMLButtonElement
    expect(dismissBtn).toBeTruthy()

    await React.act(async () => {
      dismissBtn.click()
    })

    expect(container.textContent).not.toContain('Descuento Especial de Lanzamiento')

    const raw = sessionStorage.getItem('gpi_dismissed_banners')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed['promo-2026']).toBe(true)
  })

  it('copies coupon code to clipboard when coupon button is clicked', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    })

    const root = createRoot(container)
    await React.act(async () => {
      root.render(<CampaignBanner banner={sampleBanner} />)
    })

    const couponBtn = container.querySelector('.ext-campaign-coupon') as HTMLButtonElement
    expect(couponBtn).toBeTruthy()

    await React.act(async () => {
      couponBtn.click()
    })

    expect(writeTextMock).toHaveBeenCalledWith('LAUNCH50')
    expect(container.textContent).toContain('¡Copiado!')
  })

  it('calls onOpenPricing callback when CTA link is clicked', async () => {
    const onOpenPricing = vi.fn()
    const root = createRoot(container)
    await React.act(async () => {
      root.render(<CampaignBanner banner={sampleBanner} onOpenPricing={onOpenPricing} />)
    })

    const ctaLink = container.querySelector('.ext-campaign-cta') as HTMLAnchorElement
    expect(ctaLink).toBeTruthy()

    await React.act(async () => {
      ctaLink.click()
    })

    expect(onOpenPricing).toHaveBeenCalledTimes(1)
  })
})
