'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ExternalLink,
  Eye,
  Plus,
  RefreshCw,
  Rocket,
  ShieldAlert,
  Sparkles,
  Trash2,
  Zap
} from 'lucide-react'
import { AdminShell, KpiCard, SectionCard, StatusBanner } from '../../lib/admin-shell'
import {
  DEFAULT_EXTENSION_RELEASE_CONFIG,
  type ExtensionReleaseConfig,
  type WhatsNewHighlight
} from '../../lib/admin-types'
import {
  type AdminSession,
  type AdminSupabaseClient,
  dispatchServerConfigSync,
  fetchRemoteConfigsMap,
  recordAdminAuditLog
} from '../../lib/supabase-client'

export function ReleasesContent({
  client,
  session
}: {
  client: AdminSupabaseClient
  session: AdminSession
}) {
  const [config, setConfig] = useState<ExtensionReleaseConfig>({
    ...DEFAULT_EXTENSION_RELEASE_CONFIG,
    whatsNew: {
      ...DEFAULT_EXTENSION_RELEASE_CONFIG.whatsNew,
      highlights: [...DEFAULT_EXTENSION_RELEASE_CONFIG.whatsNew.highlights]
    }
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Highlight and preview theme state
  const [previewTheme, setPreviewTheme] = useState<'dark' | 'light'>('dark')
  const [newIcon, setNewIcon] = useState('sparkles')
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    const res = await fetchRemoteConfigsMap(client)
    setLoading(false)

    if (res.data?.extension_release && typeof res.data.extension_release === 'object') {
      const saved = res.data.extension_release as any
      const rawWhatsNew = saved.whatsNew || saved.whats_new || saved.whatsNewModal || {}

      let highlights = []
      if (Array.isArray(rawWhatsNew.highlights)) {
        highlights = rawWhatsNew.highlights.map((h: any, idx: number) => {
          if (typeof h === 'string') {
            return {
              id: `hl-${idx + 1}`,
              icon: 'sparkles',
              title: h,
              description: ''
            }
          }
          return {
            id: String(h.id || `hl-${idx + 1}`),
            icon: String(h.icon || 'sparkles'),
            title: String(h.title || ''),
            description: String(h.description || '')
          }
        })
      } else {
        highlights = [...DEFAULT_EXTENSION_RELEASE_CONFIG.whatsNew.highlights]
      }

      setConfig({
        minSupportedVersion:
          saved.minSupportedVersion || saved.min_supported_version || DEFAULT_EXTENSION_RELEASE_CONFIG.minSupportedVersion,
        latestVersion:
          saved.latestVersion || saved.latest_version || DEFAULT_EXTENSION_RELEASE_CONFIG.latestVersion,
        updateUrl:
          saved.updateUrl || saved.update_url || saved.downloadUrl || DEFAULT_EXTENSION_RELEASE_CONFIG.updateUrl,
        forceUpdateNotice: Boolean(
          saved.forceUpdateNotice ?? saved.force_update_notice ?? saved.forceUpdate
        ),
        forceUpdateMessage:
          saved.forceUpdateMessage || saved.force_update_message || DEFAULT_EXTENSION_RELEASE_CONFIG.forceUpdateMessage,
        whatsNew: {
          enabled: rawWhatsNew.enabled !== false,
          version: String(
            rawWhatsNew.version || saved.latestVersion || DEFAULT_EXTENSION_RELEASE_CONFIG.whatsNew.version
          ),
          releaseDate: String(
            rawWhatsNew.releaseDate || rawWhatsNew.release_date || DEFAULT_EXTENSION_RELEASE_CONFIG.whatsNew.releaseDate
          ),
          title: String(rawWhatsNew.title || DEFAULT_EXTENSION_RELEASE_CONFIG.whatsNew.title),
          summary: String(
            rawWhatsNew.summary || rawWhatsNew.description || DEFAULT_EXTENSION_RELEASE_CONFIG.whatsNew.summary
          ),
          highlights,
          blogUrl: rawWhatsNew.blogUrl || rawWhatsNew.blog_url || '',
          ctaText:
            rawWhatsNew.ctaText || rawWhatsNew.actionButtonText || DEFAULT_EXTENSION_RELEASE_CONFIG.whatsNew.ctaText,
          ctaUrl: rawWhatsNew.ctaUrl || rawWhatsNew.actionButtonUrl || ''
        }
      })
    }
  }, [client])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)

    const compatiblePayload = {
      ...config,
      min_supported_version: config.minSupportedVersion,
      latest_version: config.latestVersion,
      update_url: config.updateUrl,
      downloadUrl: config.updateUrl,
      forceUpdate: config.forceUpdateNotice,
      force_update_notice: config.forceUpdateNotice,
      force_update_message: config.forceUpdateMessage,
      whatsNew: {
        ...config.whatsNew,
        description: config.whatsNew.summary,
        actionButtonText: config.whatsNew.ctaText,
        actionButtonUrl: config.whatsNew.ctaUrl
      },
      whatsNewModal: {
        enabled: config.whatsNew.enabled,
        version: config.whatsNew.version,
        releaseDate: config.whatsNew.releaseDate,
        title: config.whatsNew.title,
        description: config.whatsNew.summary,
        summary: config.whatsNew.summary,
        highlights: config.whatsNew.highlights,
        actionButtonText: config.whatsNew.ctaText,
        actionButtonUrl: config.whatsNew.ctaUrl
      }
    }

    const syncRes = await dispatchServerConfigSync(
      'extension_release',
      compatiblePayload,
      session.accessToken
    )

    if (syncRes.success) {
      setStatus({
        type: 'success',
        message: 'Configuración de versión y modal "What\'s New" sincronizada con éxito en KV y Supabase.'
      })
      await recordAdminAuditLog(
        client,
        session.email || session.user?.email || '',
        'update_extension_release',
        'extension_release',
        {
          minSupportedVersion: config.minSupportedVersion,
          latestVersion: config.latestVersion,
          forceUpdateNotice: config.forceUpdateNotice,
          whatsNewEnabled: config.whatsNew.enabled
        }
      )
    } else {
      setStatus({
        type: 'error',
        message: `Error al sincronizar: ${syncRes.error || 'Fallo desconocido'}`
      })
    }
    setSaving(false)
  }

  const handleAddHighlight = () => {
    if (!newTitle.trim() || !newDesc.trim()) return
    const newH: WhatsNewHighlight = {
      id: `h-${Date.now()}`,
      icon: newIcon,
      title: newTitle.trim(),
      description: newDesc.trim()
    }
    setConfig((prev) => ({
      ...prev,
      whatsNew: {
        ...prev.whatsNew,
        highlights: [...prev.whatsNew.highlights, newH]
      }
    }))
    setNewTitle('')
    setNewDesc('')
  }

  const handleRemoveHighlight = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      whatsNew: {
        ...prev.whatsNew,
        highlights: prev.whatsNew.highlights.filter((h) => h.id !== id)
      }
    }))
  }

  return (
    <div className="space-y-6">
      {status && (
        <StatusBanner
          type={status.type}
          message={status.message}
          onDismiss={() => setStatus(null)}
        />
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Versión Más Reciente"
          value={`v${config.latestVersion}`}
          hint="Revisión actual disponible en Chrome Web Store"
          icon={<Rocket className="size-4" />}
          accent="indigo"
          badge="Live"
        />
        <KpiCard
          label="Versión Mínima Soportada"
          value={`v${config.minSupportedVersion}`}
          hint="Versiones anteriores recibirán alerta de actualización"
          icon={<ShieldAlert className="size-4" />}
          accent="amber"
          badge={config.forceUpdateNotice ? 'Requerido' : 'Permisivo'}
        />
        <KpiCard
          label="Fuerza de Actualización"
          value={config.forceUpdateNotice ? 'Estricta' : 'Flexible'}
          hint={config.forceUpdateNotice ? 'Bloquea uso hasta actualizar' : 'Aviso no intrusivo'}
          icon={<AlertTriangle className="size-4" />}
          accent="rose"
          badge={config.forceUpdateNotice ? 'Bloqueo' : 'Aviso'}
        />
        <KpiCard
          label="Modal What's New"
          value={config.whatsNew.enabled ? 'Activo' : 'Desactivado'}
          hint={`${config.whatsNew.highlights.length} características destacadas`}
          icon={<Sparkles className="size-4" />}
          accent="emerald"
          badge="In-App"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Form: Version Gate & What's New Config */}
        <div className="space-y-6 lg:col-span-7">
          <SectionCard
            title="Control de Versiones & Deprecación"
            description="Controla qué versiones de la extensión pueden seguir comunicándose con la API."
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">
                    Versión Mínima Requerida
                  </label>
                  <input
                    type="text"
                    value={config.minSupportedVersion}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, minSupportedVersion: e.target.value }))
                    }
                    placeholder="1.2.0"
                    className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Extensiones con versión inferior activarán el modal de actualización.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">
                    Última Versión Publicada
                  </label>
                  <input
                    type="text"
                    value={config.latestVersion}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, latestVersion: e.target.value }))
                    }
                    placeholder="1.4.0"
                    className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Versión objetivo sugerida para descargar.
                  </p>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  URL de Actualización en Chrome Web Store
                </label>
                <input
                  type="url"
                  value={config.updateUrl}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, updateUrl: e.target.value }))
                  }
                  placeholder="https://chromewebstore.google.com/detail/..."
                  className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-white">
                      Forzar Bloqueo de Actualización
                    </h4>
                    <p className="text-xs text-slate-400">
                      Si se activa, los usuarios en versiones desactualizadas no podrán usar la IA hasta actualizar.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.forceUpdateNotice}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, forceUpdateNotice: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-white/20 bg-slate-800 text-rose-500 focus:ring-rose-500"
                  />
                </div>
                {config.forceUpdateNotice && (
                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-medium text-rose-300">
                      Mensaje de Alerta Crítica
                    </label>
                    <textarea
                      rows={2}
                      value={config.forceUpdateMessage || ''}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, forceUpdateMessage: e.target.value }))
                      }
                      className="w-full rounded-xl border border-rose-500/30 bg-rose-950/20 p-2.5 text-xs text-rose-100 placeholder-rose-400/50 focus:border-rose-500 focus:outline-none"
                      placeholder="Por motivos de seguridad, esta versión ha sido deprecada..."
                    />
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Configuración del Modal 'What\'s New'"
            description="Muestra automáticamente las novedades y características clave tras actualizar la extensión."
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/40 p-3">
                <div>
                  <span className="text-sm font-medium text-white">
                    Habilitar Modal de Novedades
                  </span>
                  <p className="text-xs text-slate-400">
                    Se abre una sola vez por usuario cuando actualiza a esta versión.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={config.whatsNew.enabled}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      whatsNew: { ...prev.whatsNew, enabled: e.target.checked }
                    }))
                  }
                  className="h-4 w-4 rounded border-white/20 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">
                    Versión de las Novedades
                  </label>
                  <input
                    type="text"
                    value={config.whatsNew.version}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        whatsNew: { ...prev.whatsNew, version: e.target.value }
                      }))
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">
                    Fecha de Publicación
                  </label>
                  <input
                    type="date"
                    value={config.whatsNew.releaseDate}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        whatsNew: { ...prev.whatsNew, releaseDate: e.target.value }
                      }))
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Título Principal del Modal
                </label>
                <input
                  type="text"
                  value={config.whatsNew.title}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      whatsNew: { ...prev.whatsNew, title: e.target.value }
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Resumen Introductorio
                </label>
                <textarea
                  rows={2}
                  value={config.whatsNew.summary}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      whatsNew: { ...prev.whatsNew, summary: e.target.value }
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-slate-900/60 p-2.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Highlights Manager */}
              <div className="space-y-3">
                <label className="block text-xs font-medium text-slate-400">
                  Características Destacadas ({config.whatsNew.highlights.length})
                </label>
                <div className="space-y-2">
                  {config.whatsNew.highlights.map((h) => (
                    <div
                      key={h.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/40 p-3"
                    >
                      <div className="flex gap-2.5">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
                          {h.icon === 'zap' ? (
                            <Zap className="size-4" />
                          ) : h.icon === 'shield' ? (
                            <ShieldAlert className="size-4" />
                          ) : (
                            <Sparkles className="size-4" />
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-white">{h.title}</p>
                          <p className="text-[11px] text-slate-400">{h.description}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveHighlight(h.id)}
                        className="rounded-lg p-1 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400"
                        title="Eliminar característica"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add highlight box */}
                <div className="rounded-xl border border-dashed border-white/15 bg-slate-950/40 p-3">
                  <p className="mb-2 text-xs font-medium text-slate-300">
                    Agregar Característica Destacada
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <select
                      value={newIcon}
                      onChange={(e) => setNewIcon(e.target.value)}
                      className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="sparkles">✨ Destacado (Sparkles)</option>
                      <option value="zap">⚡ Rendimiento (Zap)</option>
                      <option value="shield">🛡️ Seguridad (Shield)</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Título corto..."
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-white placeholder-slate-500"
                    />
                    <input
                      type="text"
                      placeholder="Descripción breve..."
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-white placeholder-slate-500"
                    />
                  </div>
                  <div className="mt-2.5 flex justify-end">
                    <button
                      type="button"
                      onClick={handleAddHighlight}
                      disabled={!newTitle.trim() || !newDesc.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                    >
                      <Plus className="size-3.5" />
                      Añadir a la Lista
                    </button>
                  </div>
                </div>
              </div>

              {/* Botón Guardar */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={loadData}
                  disabled={loading || saving}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-white/5"
                >
                  Descartar Cambios
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={loading || saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-600/25 hover:bg-indigo-500 disabled:opacity-50"
                >
                  {saving ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Guardar y Sincronizar Release
                </button>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Right Column: Live Interactive Modal Preview */}
        <div className="space-y-6 lg:col-span-5">
          <SectionCard
            title="Vista Previa en Vivo del Modal"
            description="Así es como tus usuarios verán el modal 'What's New' en su navegador."
            action={
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#090d16] p-0.5 rounded-lg border border-slate-200 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setPreviewTheme('dark')}
                  className={`px-2.5 py-1 text-[10px] font-medium rounded transition ${
                    previewTheme === 'dark' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  🌙 Modo Oscuro
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTheme('light')}
                  className={`px-2.5 py-1 text-[10px] font-medium rounded transition ${
                    previewTheme === 'light' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  ☀️ Modo Claro
                </button>
              </div>
            }
          >
            <div className={`overflow-hidden rounded-2xl border transition-colors shadow-2xl ${
              previewTheme === 'light'
                ? 'border-slate-200 bg-white text-slate-900 shadow-slate-200/60'
                : 'border-white/15 bg-gradient-to-b from-slate-900 to-slate-950 text-white'
            }`}>
              {/* Fake Chrome / Browser Titlebar */}
              <div className={`flex items-center justify-between border-b px-4 py-2.5 ${
                previewTheme === 'light'
                  ? 'border-slate-200 bg-slate-50 text-slate-600'
                  : 'border-white/10 bg-slate-950/80 text-slate-400'
              }`}>
                <div className="flex items-center gap-2">
                  <div className="size-2.5 rounded-full bg-rose-500" />
                  <div className="size-2.5 rounded-full bg-amber-500" />
                  <div className="size-2.5 rounded-full bg-emerald-500" />
                </div>
                <span className={`text-[11px] font-medium ${previewTheme === 'light' ? 'text-slate-700' : 'text-slate-400'}`}>
                  GitHub Extension • What's New
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  previewTheme === 'light'
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                    : 'bg-indigo-500/20 text-indigo-400'
                }`}>
                  v{config.whatsNew.version}
                </span>
              </div>

              {/* Modal Body Preview */}
              <div className="p-5 space-y-4">
                <div className="text-center space-y-1">
                  <div className={`inline-flex size-11 items-center justify-center rounded-2xl border shadow-inner ${
                    previewTheme === 'light'
                      ? 'bg-indigo-50 text-indigo-600 border-indigo-100'
                      : 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30'
                  }`}>
                    <Rocket className={`size-6 ${previewTheme === 'light' ? 'text-indigo-600' : 'text-indigo-400'}`} />
                  </div>
                  <h3 className={`text-base font-bold pt-1 ${previewTheme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                    {config.whatsNew.title}
                  </h3>
                  <p className={`text-xs max-w-sm mx-auto leading-relaxed ${previewTheme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>
                    {config.whatsNew.summary}
                  </p>
                </div>

                {/* Highlights List */}
                <div className="space-y-2 pt-1">
                  {config.whatsNew.highlights.map((h) => (
                    <div
                      key={h.id}
                      className={`flex items-start gap-3 rounded-xl border p-2.5 transition-colors ${
                        previewTheme === 'light'
                          ? 'border-slate-200 bg-slate-50/80 shadow-xs'
                          : 'border-white/5 bg-white/[0.03]'
                      }`}
                    >
                      <div className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${
                        previewTheme === 'light'
                          ? 'bg-indigo-100 text-indigo-600'
                          : 'bg-indigo-500/20 text-indigo-400'
                      }`}>
                        {h.icon === 'zap' ? (
                          <Zap className="size-3.5" />
                        ) : h.icon === 'shield' ? (
                          <ShieldAlert className="size-3.5" />
                        ) : (
                          <Sparkles className="size-3.5" />
                        )}
                      </div>
                      <div>
                        <h5 className={`text-xs font-semibold ${previewTheme === 'light' ? 'text-slate-900' : 'text-white'}`}>{h.title}</h5>
                        <p className={`text-[11px] leading-snug ${previewTheme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>{h.description}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Modal Action CTA */}
                <div className="pt-2">
                  <button
                    type="button"
                    className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-600/20 hover:from-indigo-500 hover:to-indigo-400 transition"
                  >
                    {config.whatsNew.ctaText || '¡Comenzar a Explorar!'}
                  </button>
                  {config.whatsNew.blogUrl && (
                    <p className={`mt-2 text-center text-[10px] ${previewTheme === 'light' ? 'text-slate-600' : 'text-slate-500'}`}>
                      ¿Quieres ver el changelog completo?{' '}
                      <span className={`${previewTheme === 'light' ? 'text-indigo-600' : 'text-indigo-400'} underline cursor-pointer`}>
                        Leer notas de la versión
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

export default function ReleasesPage() {
  return (
    <AdminShell
      activeRoute="/releases"
      title="Versiones & Gestor 'What's New'"
      subtitle="Supervisa versiones mínimas admitidas, fuerza de actualización y diseña el modal de novedades que verán los usuarios al actualizar."
    >
      {({ client, session }) => <ReleasesContent client={client} session={session} />}
    </AdminShell>
  )
}
