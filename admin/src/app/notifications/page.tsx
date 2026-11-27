'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  ExternalLink,
  Eye,
  Info,
  Megaphone,
  Pin,
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
  DEFAULT_IN_APP_NOTIFICATIONS_CONFIG,
  type InAppNotificationItem,
  type InAppNotificationsConfig,
  type InAppNotificationType
} from '../../lib/admin-types'
import {
  type AdminSession,
  type AdminSupabaseClient,
  dispatchServerConfigSync,
  fetchRemoteConfigsMap,
  recordAdminAuditLog
} from '../../lib/supabase-client'

export function NotificationsContent({
  client,
  session
}: {
  client: AdminSupabaseClient
  session: AdminSession
}) {
  const [config, setConfig] = useState<InAppNotificationsConfig>({
    ...DEFAULT_IN_APP_NOTIFICATIONS_CONFIG
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Form State
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('¡Nueva función: Diagramas Mermaid en vivo!')
  const [message, setMessage] = useState('Explora la arquitectura de cualquier repositorio directamente en el sidepanel con 1 clic.')
  const [type, setType] = useState<InAppNotificationType>('feature')
  const [targetTier, setTargetTier] = useState<'all' | 'free' | 'pro'>('all')
  const [actionUrl, setActionUrl] = useState('https://github.com')
  const [actionLabel, setActionLabel] = useState('Ver demostración')
  const [pinned, setPinned] = useState(false)
  const [active, setActive] = useState(true)
  const [expiresAt, setExpiresAt] = useState('')

  // Preview tier filter
  const [previewTier, setPreviewTier] = useState<'free' | 'pro'>('free')

  const loadData = useCallback(async () => {
    setLoading(true)
    const res = await fetchRemoteConfigsMap(client)
    setLoading(false)

    if (res.data?.in_app_notifications) {
      const raw = res.data.in_app_notifications
      const rawList = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object' && Array.isArray((raw as any).notifications)
          ? (raw as any).notifications
          : []

      if (rawList.length > 0) {
        const normalized: InAppNotificationItem[] = rawList.map((item: any, idx: number) => ({
          id: String(item.id || `notif-${idx + 1}`),
          title: String(item.title || ''),
          message: String(item.message || ''),
          type: (item.type || 'info') as InAppNotificationType,
          targetTier: (item.targetTier || 'all') as 'all' | 'free' | 'pro',
          actionUrl: item.actionUrl || item.action_url || '',
          actionLabel: item.actionLabel || item.actionText || item.action_label || '',
          pinned: Boolean(item.pinned),
          active: item.active !== false && item.enabled !== false,
          createdAt: String(item.createdAt || item.created_at || new Date().toISOString()),
          expiresAt: item.expiresAt || item.expires_at || undefined,
          readCount: Number(item.readCount || 0),
          clickCount: Number(item.clickCount || 0)
        }))
        setConfig({ notifications: normalized })
      }
    }
  }, [client])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSave = async (updatedList: InAppNotificationItem[]) => {
    setSaving(true)
    setStatus(null)

    const compatibleList = updatedList.map((item) => ({
      ...item,
      enabled: item.active,
      actionText: item.actionLabel || ''
    }))
    const newConfig: InAppNotificationsConfig = { notifications: compatibleList }
    setConfig(newConfig)

    const syncRes = await dispatchServerConfigSync(
      'in_app_notifications',
      newConfig,
      session.accessToken
    )

    if (syncRes.success) {
      setStatus({
        type: 'success',
        message: 'Centro de notificaciones in-app sincronizado con éxito en KV y Supabase.'
      })
      await recordAdminAuditLog(
        client,
        session.email || session.user?.email || '',
        'update_in_app_notifications',
        'in_app_notifications',
        { count: updatedList.length }
      )
    } else {
      setStatus({
        type: 'error',
        message: `Error al sincronizar: ${syncRes.error || 'Error'}`
      })
    }
    setSaving(false)
  }

  const handleCreateOrUpdate = async () => {
    if (!title.trim() || !message.trim()) {
      setStatus({ type: 'error', message: 'El título y el mensaje son requeridos.' })
      return
    }

    let updated: InAppNotificationItem[]
    if (editingId) {
      updated = config.notifications.map((n) =>
        n.id === editingId
          ? {
              ...n,
              title: title.trim(),
              message: message.trim(),
              type,
              targetTier,
              actionUrl: actionUrl.trim() || undefined,
              actionLabel: actionLabel.trim() || undefined,
              pinned,
              active,
              expiresAt: expiresAt || undefined
            }
          : n
      )
    } else {
      const newItem: InAppNotificationItem = {
        id: `notif-${Date.now()}`,
        title: title.trim(),
        message: message.trim(),
        type,
        targetTier,
        actionUrl: actionUrl.trim() || undefined,
        actionLabel: actionLabel.trim() || undefined,
        pinned,
        active,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt || undefined,
        readCount: 0,
        clickCount: 0
      }
      updated = [newItem, ...config.notifications]
    }

    await handleSave(updated)
    resetForm()
  }

  const resetForm = () => {
    setShowAddForm(false)
    setEditingId(null)
    setTitle('')
    setMessage('')
    setType('feature')
    setTargetTier('all')
    setActionUrl('')
    setActionLabel('')
    setPinned(false)
    setActive(true)
    setExpiresAt('')
  }

  const handleEdit = (item: InAppNotificationItem) => {
    setEditingId(item.id)
    setTitle(item.title)
    setMessage(item.message)
    setType(item.type)
    setTargetTier(item.targetTier)
    setActionUrl(item.actionUrl || '')
    setActionLabel(item.actionLabel || '')
    setPinned(item.pinned)
    setActive(item.active)
    setExpiresAt(item.expiresAt || '')
    setShowAddForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar esta notificación?')) return
    const updated = config.notifications.filter((n) => n.id !== id)
    await handleSave(updated)
  }

  const handleToggleActive = async (id: string) => {
    const updated = config.notifications.map((n) =>
      n.id === id ? { ...n, active: !n.active } : n
    )
    await handleSave(updated)
  }

  const activeCount = config.notifications.filter((n) => n.active).length
  const totalReads = config.notifications.reduce((acc, n) => acc + (n.readCount || 0), 0)
  const totalClicks = config.notifications.reduce((acc, n) => acc + (n.clickCount || 0), 0)
  const avgCtr = totalReads > 0 ? ((totalClicks / totalReads) * 100).toFixed(1) : '0.0'

  const previewNotifications = config.notifications.filter(
    (n) => n.active && (n.targetTier === 'all' || n.targetTier === previewTier)
  )

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
          label="Avisos Activos"
          value={activeCount.toString()}
          hint={`De ${config.notifications.length} anuncios creados`}
          icon={<Bell className="size-4" />}
          accent="indigo"
          badge="Live"
        />
        <KpiCard
          label="Aperturas / Vistas"
          value={totalReads.toLocaleString()}
          hint="Impresiones en el centro de avisos"
          icon={<Eye className="size-4" />}
          accent="sky"
          badge="Vistas"
        />
        <KpiCard
          label="Clics en Acciones"
          value={totalClicks.toLocaleString()}
          hint="Interacciones con botones de enlace"
          icon={<ExternalLink className="size-4" />}
          accent="emerald"
          badge="Clicks"
        />
        <KpiCard
          label="Tasa de Clics (CTR)"
          value={`${avgCtr}%`}
          hint="Efectividad de engagement"
          icon={<Sparkles className="size-4" />}
          accent="purple"
          badge="CTR"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Form & Table */}
        <div className="space-y-6 lg:col-span-7">
          <SectionCard
            title="Gestor de Notificaciones In-App"
            description="Envía avisos de producto, promociones segmentadas y advertencias de mantenimiento directo al icono de campana de la extensión."
            action={
              <button
                type="button"
                onClick={() => {
                  resetForm()
                  setShowAddForm(!showAddForm)
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-indigo-500"
              >
                <Plus className="size-3.5" />
                {showAddForm ? 'Cerrar Formulario' : 'Crear Notificación'}
              </button>
            }
          >
            {showAddForm && (
              <div className="mb-6 space-y-4 rounded-2xl border border-indigo-500/20 bg-slate-950/60 p-4">
                <h4 className="text-xs font-bold text-white">
                  {editingId ? 'Editar Notificación' : 'Nueva Notificación Push In-App'}
                </h4>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-400">
                      Tipo de Notificación
                    </label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as InAppNotificationType)}
                      className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white"
                    >
                      <option value="feature">✨ Característica (Feature)</option>
                      <option value="announcement">📢 Anuncio / Noticia</option>
                      <option value="tip">💡 Consejo / Tip</option>
                      <option value="warning">⚠️ Advertencia / Alerta</option>
                      <option value="info">ℹ️ Información General</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-400">
                      Audiencia Objetivo (Segmento)
                    </label>
                    <select
                      value={targetTier}
                      onChange={(e) => setTargetTier(e.target.value as 'all' | 'free' | 'pro')}
                      className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white"
                    >
                      <option value="all">🌐 Todos los Usuarios</option>
                      <option value="free">🆓 Solo Usuarios Free (Upsell)</option>
                      <option value="pro">⭐ Solo Usuarios Pro (Exclusivo)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">
                    Título del Aviso
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ej. ¡Descubre los nuevos diagramas Mermaid!"
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">
                    Mensaje Detallado
                  </label>
                  <textarea
                    rows={2}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Explica qué hay de nuevo o qué acción debe tomar el usuario..."
                    className="w-full rounded-xl border border-white/10 bg-slate-900 p-2.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-400">
                      Texto del Botón CTA (Opcional)
                    </label>
                    <input
                      type="text"
                      value={actionLabel}
                      onChange={(e) => setActionLabel(e.target.value)}
                      placeholder="Ej. Ver demo, Actualizar ahora"
                      className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-400">
                      Enlace de Destino (URL)
                    </label>
                    <input
                      type="url"
                      value={actionUrl}
                      onChange={(e) => setActionUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-5 pt-1">
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pinned}
                      onChange={(e) => setPinned(e.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-slate-800 text-indigo-500"
                    />
                    Fijar al inicio (Pinned)
                  </label>

                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => setActive(e.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-slate-800 text-emerald-500"
                    />
                    Activa inmediatamente
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:bg-white/5"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateOrUpdate}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {saving ? <RefreshCw className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                    {editingId ? 'Actualizar Aviso' : 'Publicar Aviso'}
                  </button>
                </div>
              </div>
            )}

            {/* Notifications Table */}
            <div className="space-y-3">
              {config.notifications.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-xs text-slate-500">
                  No hay notificaciones creadas. Haz clic en "Crear Notificación" para comenzar.
                </div>
              ) : (
                config.notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`rounded-xl border p-4 transition ${
                      n.active
                        ? 'border-white/10 bg-slate-900/40 hover:border-white/20'
                        : 'border-white/5 bg-slate-950/40 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${
                            n.type === 'feature'
                              ? 'bg-indigo-500/10 text-indigo-400'
                              : n.type === 'warning'
                              ? 'bg-rose-500/10 text-rose-400'
                              : n.type === 'tip'
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'bg-emerald-500/10 text-emerald-400'
                          }`}
                        >
                          {n.type === 'feature' ? (
                            <Sparkles className="size-4" />
                          ) : n.type === 'warning' ? (
                            <AlertTriangle className="size-4" />
                          ) : n.type === 'tip' ? (
                            <Zap className="size-4" />
                          ) : (
                            <Megaphone className="size-4" />
                          )}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h5 className="text-xs font-bold text-white">{n.title}</h5>
                            {n.pinned && (
                              <span className="inline-flex items-center gap-1 rounded bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-bold text-indigo-300">
                                <Pin className="size-2.5" /> PINNED
                              </span>
                            )}
                            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-400 uppercase">
                              {n.targetTier}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                n.active
                                  ? 'bg-emerald-500/15 text-emerald-400'
                                  : 'bg-slate-800 text-slate-500'
                              }`}
                            >
                              {n.active ? 'Activa' : 'Pausada'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-300">{n.message}</p>
                          {n.actionLabel && (
                            <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-indigo-400">
                              {n.actionLabel}
                              <ArrowRight className="size-3" />
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(n.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                          title={n.active ? 'Pausar' : 'Activar'}
                        >
                          <Radio className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEdit(n)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                          title="Editar"
                        >
                          <Tag className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(n.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400"
                          title="Eliminar"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>

        {/* Right Column: Live In-Extension Popover Preview */}
        <div className="space-y-6 lg:col-span-5">
          <SectionCard
            title="Vista Previa en el Cajón de la Extensión"
            description="Comprueba cómo se visualizarán tus avisos para los usuarios."
            action={
              <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-slate-900/60 p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setPreviewTier('free')}
                  className={`rounded-md px-2 py-0.5 font-medium transition ${
                    previewTier === 'free'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Vista Free
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTier('pro')}
                  className={`rounded-md px-2 py-0.5 font-medium transition ${
                    previewTier === 'pro'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Vista Pro
                </button>
              </div>
            }
          >
            <div className="overflow-hidden rounded-2xl border border-white/15 bg-slate-950 shadow-2xl">
              {/* Header Drawer */}
              <div className="flex items-center justify-between border-b border-white/10 bg-slate-900/80 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bell className="size-4 text-indigo-400" />
                  <span className="text-xs font-bold text-white">Centro de Novedades</span>
                </div>
                <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-400">
                  {previewNotifications.length} nuevas
                </span>
              </div>

              {/* Drawer Body */}
              <div className="p-3 space-y-2.5 max-h-[420px] overflow-y-auto">
                {previewNotifications.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    No hay notificaciones activas para usuarios de nivel {previewTier}.
                  </div>
                ) : (
                  previewNotifications.map((n) => (
                    <div
                      key={n.id}
                      className="rounded-xl border border-white/10 bg-slate-900/60 p-3 hover:border-indigo-500/40 transition"
                    >
                      <div className="flex items-start gap-2.5">
                        <div
                          className={`flex size-6 shrink-0 items-center justify-center rounded-lg ${
                            n.type === 'feature'
                              ? 'bg-indigo-500/20 text-indigo-400'
                              : n.type === 'warning'
                              ? 'bg-rose-500/20 text-rose-400'
                              : 'bg-emerald-500/20 text-emerald-400'
                          }`}
                        >
                          {n.type === 'feature' ? (
                            <Sparkles className="size-3" />
                          ) : (
                            <Megaphone className="size-3" />
                          )}
                        </div>
                        <div className="flex-1">
                          <h6 className="text-xs font-bold text-white">{n.title}</h6>
                          <p className="mt-0.5 text-[11px] text-slate-300 leading-relaxed">
                            {n.message}
                          </p>
                          {n.actionLabel && (
                            <div className="mt-2">
                              <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-600/30 px-2.5 py-1 text-[11px] font-semibold text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/50 cursor-pointer">
                                {n.actionLabel}
                                <ArrowRight className="size-3" />
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

export default function NotificationsPage() {
  return (
    <AdminShell
      activeRoute="/notifications"
      title="Centro de Notificaciones & Anuncios In-App"
      subtitle="Publica anuncios interactivos, novedades y promociones dirigidas que los usuarios reciben directamente dentro del panel de la extensión."
    >
      {({ client, session }) => <NotificationsContent client={client} session={session} />}
    </AdminShell>
  )
}
