'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  Megaphone,
  Plus,
  Radio,
  RefreshCw,
  Sparkles,
  Tag,
  Trash2,
  Users,
  Zap
} from 'lucide-react'
import { AdminShell, KpiCard, SectionCard, StatusBanner } from '../../lib/admin-shell'
import {
  type CampaignBannerItem,
  type CampaignBannersConfig,
  type CampaignTargetTier,
  DEFAULT_CAMPAIGN_BANNERS_CONFIG
} from '../../lib/admin-types'
import {
  type AdminSession,
  type AdminSupabaseClient,
  dispatchServerConfigSync,
  fetchRemoteConfigsMap,
  recordAdminAuditLog
} from '../../lib/supabase-client'

export function CampaignsContent({
  client,
  session
}: {
  client: AdminSupabaseClient
  session: AdminSession
}) {
  const [config, setConfig] = useState<CampaignBannersConfig>({ ...DEFAULT_CAMPAIGN_BANNERS_CONFIG })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Edit / Create banner form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('Desbloquea Análisis Ilimitados con Pro')
  const [message, setMessage] = useState('Obtén diagramas de arquitectura interactivos Mermaid y chat ilimitado con Octo.')
  const [badge, setBadge] = useState('50% OFF')
  const [targetTier, setTargetTier] = useState<CampaignTargetTier>('free')
  const [ctaText, setCtaText] = useState('Actualizar a Pro')
  const [ctaUrl, setCtaUrl] = useState('https://github-intelligence.com/pricing')
  const [couponCode, setCouponCode] = useState('LAUNCH50')
  const [enabled, setEnabled] = useState(true)

  // Dock Preview tier switcher
  const [previewTier, setPreviewTier] = useState<'free' | 'pro'>('free')
  const [copiedCoupon, setCopiedCoupon] = useState(false)

  // Global Upper Announcement Banner (banner_message in feature_flags)
  const [globalBannerText, setGlobalBannerText] = useState('')
  const [featureFlagsRaw, setFeatureFlagsRaw] = useState<Record<string, unknown>>({})
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false)
  const [savingGlobalBanner, setSavingGlobalBanner] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const res = await fetchRemoteConfigsMap(client)
    setLoading(false)

    if (res.data?.campaign_banners) {
      const raw = res.data.campaign_banners
      const bannersList = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object' && Array.isArray((raw as any).banners)
          ? (raw as any).banners
          : []
      if (bannersList.length > 0) {
        setConfig({ banners: bannersList })
      }
    }

    if (res.data?.feature_flags && typeof res.data.feature_flags === 'object') {
      const rawFlags = res.data.feature_flags as Record<string, unknown>
      setFeatureFlagsRaw(rawFlags)
      setGlobalBannerText(typeof rawFlags.banner_message === 'string' ? rawFlags.banner_message : '')
      setIsMaintenanceMode(Boolean(rawFlags.maintenance_mode))
    }
  }, [client])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function persistBanners(newConfig: CampaignBannersConfig, successMsg: string, actionType: string, targetName: string) {
    setSaving(true)
    setStatus(null)
    const res = await dispatchServerConfigSync(
      'campaign_banners',
      newConfig,
      session.accessToken
    )
    setSaving(false)

    if (res.success) {
      setConfig(newConfig)
      setStatus({ type: 'success', message: successMsg })
      await recordAdminAuditLog(
        client,
        session.email,
        actionType,
        targetName,
        { totalBanners: newConfig.banners.length },
        session.accessToken
      )
    } else {
      setStatus({ type: 'error', message: res.error || 'Error al sincronizar campañas en KV.' })
    }
  }

  async function handleSaveGlobalBanner(nextText: string) {
    setSavingGlobalBanner(true)
    setStatus(null)
    const updatedFlags = {
      ...featureFlagsRaw,
      banner_message: nextText.trim()
    }
    const res = await dispatchServerConfigSync(
      'feature_flags',
      updatedFlags,
      session.accessToken
    )
    setSavingGlobalBanner(false)
    if (res.success) {
      setGlobalBannerText(nextText.trim())
      setFeatureFlagsRaw(updatedFlags)
      setStatus({
        type: 'success',
        message: nextText.trim()
          ? 'Banner superior global de avisos actualizado correctamente en Cloudflare KV.'
          : 'Banner superior global desactivado (oculto en la extensión).'
      })
      await recordAdminAuditLog(
        client,
        session.email,
        'UPDATE_GLOBAL_BANNER',
        'feature_flags.banner_message',
        { banner_message: nextText.trim() },
        session.accessToken
      )
    } else {
      setStatus({ type: 'error', message: res.error || 'Error al guardar el banner superior global.' })
    }
  }

  function handleOpenCreate() {
    setEditingId(null)
    setTitle('Potencia tu Flujo de Trabajo')
    setMessage('Nueva actualización con soporte para Rust, Go y diagramas avanzados.')
    setBadge('NUEVO')
    setTargetTier('all')
    setCtaText('Conoce Más')
    setCtaUrl('https://github-intelligence.com/changelog')
    setCouponCode('')
    setEnabled(true)
    setShowAddForm(true)
  }

  function handleOpenEdit(b: CampaignBannerItem) {
    setEditingId(b.id)
    setTitle(b.title)
    setMessage(b.message)
    setBadge(b.badge || '')
    setTargetTier(b.targetTier)
    setCtaText(b.ctaText)
    setCtaUrl(b.ctaUrl)
    setCouponCode(b.couponCode || '')
    setEnabled(b.enabled)
    setShowAddForm(true)
  }

  async function handleSaveBanner(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !ctaText.trim()) return

    const bannerItem: CampaignBannerItem = {
      id: editingId || `banner_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim(),
      message: message.trim(),
      badge: badge.trim() || undefined,
      targetTier,
      ctaText: ctaText.trim(),
      ctaUrl: ctaUrl.trim() || 'https://github-intelligence.com',
      couponCode: couponCode.trim() || undefined,
      enabled,
      priority: 1,
      createdAt: new Date().toISOString()
    }

    let nextBanners: CampaignBannerItem[]
    if (editingId) {
      nextBanners = config.banners.map((b) => (b.id === editingId ? bannerItem : b))
    } else {
      nextBanners = [bannerItem, ...config.banners]
    }

    const nextConfig = { banners: nextBanners }
    await persistBanners(
      nextConfig,
      `Campaña "${title}" guardada y sincronizada en el Edge.`,
      editingId ? 'CAMPAIGN_UPDATED' : 'CAMPAIGN_CREATED',
      title
    )
    setShowAddForm(false)
    setEditingId(null)
  }

  async function handleToggleBanner(id: string) {
    const target = config.banners.find((b) => b.id === id)
    if (!target) return
    const nextBanners = config.banners.map((b) => (b.id === id ? { ...b, enabled: !b.enabled } : b))
    const nextConfig = { banners: nextBanners }
    await persistBanners(
      nextConfig,
      `Campaña "${target.title}" ${!target.enabled ? 'activada' : 'pausada'}.`,
      'CAMPAIGN_TOGGLED',
      target.title
    )
  }

  async function handleDeleteBanner(id: string) {
    const target = config.banners.find((b) => b.id === id)
    if (!window.confirm(`¿Eliminar la campaña "${target?.title || id}"?`)) return
    const nextBanners = config.banners.filter((b) => b.id !== id)
    const nextConfig = { banners: nextBanners }
    await persistBanners(
      nextConfig,
      `Campaña "${target?.title || id}" eliminada.`,
      'CAMPAIGN_DELETED',
      target?.title || id
    )
  }

  // Active banner for dock preview
  const activeBannerForPreview = config.banners.find(
    (b) => b.enabled && (b.targetTier === 'all' || b.targetTier === previewTier)
  )

  const activeCount = config.banners.filter((b) => b.enabled).length
  const freeCount = config.banners.filter((b) => b.targetTier === 'free').length
  const proCount = config.banners.filter((b) => b.targetTier === 'pro').length

  return (
    <div className="space-y-6">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Campañas Totales"
          value={config.banners.length}
          hint={`${activeCount} activas · ${config.banners.length - activeCount} en pausa`}
          accent="indigo"
          badge="En dock"
          sparkline={[1, 2, 2, config.banners.length || 2]}
          icon={<Megaphone className="size-5" />}
        />
        <KpiCard
          label="Banners Activos en Vivo"
          value={activeCount}
          hint="Mostrándose en la extensión"
          accent="emerald"
          badge="Live"
          sparkline={[1, 1, activeCount, activeCount]}
          icon={<Zap className="size-5" />}
        />
        <KpiCard
          label="Dirigidas a Free (Upsell)"
          value={freeCount}
          hint="Conversión a Pro"
          accent="purple"
          badge="Upsell"
          sparkline={[1, 1, 1, freeCount || 1]}
          icon={<Sparkles className="size-5" />}
        />
        <KpiCard
          label="Dirigidas a Pro"
          value={proCount}
          hint="Novedades para suscriptores"
          accent="amber"
          badge="Retención"
          sparkline={[0, 1, 1, proCount || 1]}
          icon={<Users className="size-5" />}
        />
      </div>

      {/* Banner Superior Global de Avisos & Transmisión (banner_message) */}
      <div className="rounded-2xl border border-white/10 bg-[#090d16]/80 p-5 backdrop-blur-md shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Megaphone className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Banner Superior Global de Avisos (Encabezado)</h3>
              <p className="text-xs text-slate-400">
                Aviso textual fijo mostrado en la parte superior del Sidepanel y Popup de la extensión.
              </p>
            </div>
          </div>
          {globalBannerText.trim() ? (
            <span className="self-start sm:self-auto text-[11px] font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded-full flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
              Activo: &quot;{globalBannerText}&quot;
            </span>
          ) : (
            <span className="self-start sm:self-auto text-[11px] text-slate-500 bg-white/5 border border-white/5 px-2.5 py-1 rounded-full">
              Inactivo (Oculto en extensión)
            </span>
          )}
        </div>

        <div className="space-y-3 pt-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={globalBannerText}
              onChange={(e) => setGlobalBannerText(e.target.value)}
              placeholder="Ej: Pronto estaremos en línea | Mantenimiento programado hoy a las 02:00 UTC"
              className="flex-1 rounded-xl border border-white/10 bg-[#0b1120] px-4 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-500/60 focus:outline-none transition"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSaveGlobalBanner(globalBannerText)}
                disabled={savingGlobalBanner}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-amber-600/20 transition disabled:opacity-50"
              >
                {savingGlobalBanner ? 'Guardando...' : 'Actualizar Aviso'}
              </button>
              {globalBannerText ? (
                <button
                  type="button"
                  onClick={() => {
                    setGlobalBannerText('')
                    void handleSaveGlobalBanner('')
                  }}
                  disabled={savingGlobalBanner}
                  className="rounded-xl border border-white/10 bg-white/5 hover:bg-rose-500/10 hover:border-rose-500/30 text-slate-400 hover:text-rose-300 px-3 py-2 text-xs transition"
                  title="Eliminar y ocultar el aviso superior"
                >
                  Limpiar / Desactivar
                </button>
              ) : null}
            </div>
          </div>

          {globalBannerText.trim() ? (
            <div className="pt-2">
              <div
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs border ${
                  isMaintenanceMode
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                }`}
              >
                <AlertCircle className={`size-3.5 shrink-0 ${isMaintenanceMode ? 'text-rose-400' : 'text-amber-400'}`} />
                <span className="font-medium truncate">{globalBannerText}</span>
                <span className="ml-auto text-[10px] uppercase font-bold tracking-wider opacity-85 shrink-0 px-2 py-0.5 rounded bg-black/20">
                  {isMaintenanceMode ? 'Alerta Mantenimiento (503)' : 'Aviso Informativo'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              Consejo: También puedes activar o desactivar este aviso desde el menú <strong>Cuotas &amp; Feature Flags</strong>.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Campaigns List & Actions */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Megaphone className="size-4 text-indigo-400" />
              Campañas de Anuncios en el Dock
            </h3>
            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition"
            >
              <Plus className="size-3.5" />
              <span>Nueva Campaña</span>
            </button>
          </div>

          {/* Create / Edit Form */}
          {showAddForm && (
            <form
              onSubmit={handleSaveBanner}
              className="rounded-2xl border border-indigo-500/30 bg-[#0f172a]/95 backdrop-blur-xl p-5 space-y-3.5 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Sparkles className="size-4 text-indigo-400" />
                  {editingId ? 'Editar Campaña' : 'Crear Nueva Campaña para el Dock'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-slate-400 hover:text-white text-xs"
                >
                  Cerrar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-slate-400 mb-1">Título de la Campaña</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-1.5 text-xs text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-slate-400 mb-1">Mensaje Explicativo</label>
                  <textarea
                    rows={2}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-1.5 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Audiencia Objetivo</label>
                  <select
                    value={targetTier}
                    onChange={(e) => setTargetTier(e.target.value as CampaignTargetTier)}
                    className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-1.5 text-xs text-white"
                  >
                    <option value="free">Solo Usuarios Free (Upsell a Pro)</option>
                    <option value="all">Todos los Usuarios</option>
                    <option value="pro">Solo Suscriptores Pro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Badge Promocional</label>
                  <input
                    type="text"
                    placeholder="ej. 50% OFF o NUEVO"
                    value={badge}
                    onChange={(e) => setBadge(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-1.5 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Texto del Botón CTA</label>
                  <input
                    type="text"
                    value={ctaText}
                    onChange={(e) => setCtaText(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-1.5 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">URL de Destino</label>
                  <input
                    type="url"
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-1.5 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Código de Cupón (Opcional)</label>
                  <input
                    type="text"
                    placeholder="ej. BLACKFRIDAY"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-1.5 text-xs text-white font-mono uppercase"
                  />
                </div>

                <div className="flex items-center gap-2 pt-5">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setEnabled(e.target.checked)}
                      className="rounded border-white/10 bg-[#090d16] text-indigo-500"
                    />
                    <span>Activar Campaña Inmediatamente</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !title.trim()}
                  className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 text-xs font-semibold text-white shadow-md disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Publicar Campaña'}
                </button>
              </div>
            </form>
          )}

          {/* Campaigns List */}
          <div className="space-y-3">
            {config.banners.map((item) => (
              <div
                key={item.id}
                className={`rounded-2xl border p-4 transition space-y-3 ${
                  item.enabled
                    ? 'border-white/10 bg-[#090d16]/80 hover:border-white/20'
                    : 'border-white/5 bg-[#090d16]/30 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">{item.title}</span>
                      {item.badge && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {item.badge}
                        </span>
                      )}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        {item.targetTier === 'free' ? 'Solo Free' : item.targetTier === 'pro' ? 'Solo Pro' : 'Todos'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">{item.message}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleBanner(item.id)}
                      className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition ${
                        item.enabled
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border border-white/5'
                      }`}
                    >
                      {item.enabled ? 'Activa' : 'Pausada'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(item)}
                      className="px-2.5 py-1 rounded-xl border border-white/10 text-slate-300 hover:text-white text-xs transition"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteBanner(item.id)}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-400 transition"
                      title="Eliminar campaña"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-white/5">
                  <div className="flex items-center gap-3">
                    <span>CTA: <strong className="text-white">{item.ctaText}</strong></span>
                    {item.couponCode && (
                      <span className="font-mono bg-white/5 px-1.5 py-0.5 rounded text-amber-300">
                        Cupón: {item.couponCode}
                      </span>
                    )}
                  </div>
                  <a
                    href={item.ctaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
                  >
                    <span>Enlace</span>
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Live Floating Dock Preview */}
        <div className="lg:col-span-5 space-y-4">
          <SectionCard
            title="Previsualizador en Vivo del Dock Flotante"
            subtitle="Así es exactamente como verán los usuarios el banner dentro de GitHub."
            icon={<Eye className="size-4 text-indigo-400" />}
            action={
              <div className="flex items-center gap-1 bg-[#090d16] p-0.5 rounded-lg border border-white/5">
                <button
                  type="button"
                  onClick={() => setPreviewTier('free')}
                  className={`px-2 py-1 text-[10px] font-medium rounded ${
                    previewTier === 'free' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Vista Free
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTier('pro')}
                  className={`px-2 py-1 text-[10px] font-medium rounded ${
                    previewTier === 'pro' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Vista Pro
                </button>
              </div>
            }
          >
            {/* Simulated GitHub Page & Floating Dock */}
            <div className="rounded-2xl border border-white/10 bg-[#070b14] p-4 space-y-3 relative overflow-hidden">
              {/* Fake GitHub Repo Bar */}
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full bg-rose-500" />
                  <div className="size-2 rounded-full bg-amber-500" />
                  <div className="size-2 rounded-full bg-emerald-500" />
                  <span className="font-mono text-slate-300 ml-1">github.com/facebook/react</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 font-semibold text-slate-300">
                  {previewTier === 'free' ? 'Usuario Free' : 'Usuario Pro (Activo)'}
                </span>
              </div>

              {/* Simulated Extension Dock Header */}
              <div className="rounded-xl border border-indigo-500/30 bg-[#0f172a]/90 backdrop-blur-md p-3 space-y-2.5 shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs">
                      🐙
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white">GitHub Project Intelligence</div>
                      <div className="text-[10px] text-slate-400">Dock Flotante en Navegador</div>
                    </div>
                  </div>
                  <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>

                {/* Banner Render */}
                {activeBannerForPreview ? (
                  <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-indigo-500/10 to-purple-500/15 p-3.5 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {activeBannerForPreview.badge && (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-400 text-slate-950">
                              {activeBannerForPreview.badge}
                            </span>
                          )}
                          <span className="text-xs font-bold text-white">
                            {activeBannerForPreview.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-snug">
                          {activeBannerForPreview.message}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
                      {activeBannerForPreview.couponCode ? (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(activeBannerForPreview.couponCode || '')
                            setCopiedCoupon(true)
                            setTimeout(() => setCopiedCoupon(false), 2000)
                          }}
                          className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-1 rounded-lg border border-amber-400/40 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 transition"
                        >
                          <Tag className="size-3" />
                          <span>{activeBannerForPreview.couponCode}</span>
                          {copiedCoupon ? <Check className="size-3" /> : <Copy className="size-3" />}
                        </button>
                      ) : (
                        <div />
                      )}

                      <a
                        href={activeBannerForPreview.ctaUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 text-slate-950 shadow-md shadow-amber-500/20 transition active:scale-95"
                      >
                        <span>{activeBannerForPreview.ctaText}</span>
                        <ArrowRight className="size-3" />
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">
                    No hay campañas activas dirigidas a esta categoría de usuario ({previewTier}).
                  </div>
                )}

                {/* Simulated Dock Content Preview */}
                <div className="space-y-1.5 pt-2 border-t border-white/5 opacity-50">
                  <div className="h-3 w-3/4 rounded bg-white/10" />
                  <div className="h-2 w-1/2 rounded bg-white/10" />
                  <div className="h-10 rounded-lg bg-white/5 border border-white/5" />
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

export default function CampaignsPage() {
  return (
    <AdminShell
      activeRoute="/campaigns"
      title="Gestor de Campañas & Banners Dinámicos"
      subtitle="Configura avisos, promociones de upsell a Pro y cupones de descuento que se renderizan en tiempo real dentro del dock de GitHub."
    >
      {({ client, session }) => <CampaignsContent client={client} session={session} />}
    </AdminShell>
  )
}
