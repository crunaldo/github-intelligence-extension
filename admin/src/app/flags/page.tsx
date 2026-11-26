'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { AlertCircle, AlertOctagon, GitBranch, Megaphone, MessageSquare, Save, Sliders, Sparkles, Trash2 } from 'lucide-react'
import { AdminShell, SectionCard, StatusBanner } from '../../lib/admin-shell'
import {
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_FREE_DAILY_LIMIT,
  DEFAULT_PRO_DAILY_LIMIT,
  type FeatureFlagsConfig
} from '../../lib/admin-types'
import {
  type AdminSession,
  type AdminSupabaseClient,
  dispatchServerConfigSync,
  fetchRemoteConfigsMap
} from '../../lib/supabase-client'

function parseLimit(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.round(raw)
  }
  if (typeof raw === 'string') {
    const parsed = Number.parseInt(raw, 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return fallback
}

function parseFlags(raw: unknown): FeatureFlagsConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_FEATURE_FLAGS }
  }
  const obj = raw as Record<string, unknown>
  return {
    mascot_enabled:
      typeof obj.mascot_enabled === 'boolean'
        ? obj.mascot_enabled
        : DEFAULT_FEATURE_FLAGS.mascot_enabled,
    diagrams_enabled:
      typeof obj.diagrams_enabled === 'boolean'
        ? obj.diagrams_enabled
        : DEFAULT_FEATURE_FLAGS.diagrams_enabled,
    maintenance_mode:
      typeof obj.maintenance_mode === 'boolean'
        ? obj.maintenance_mode
        : DEFAULT_FEATURE_FLAGS.maintenance_mode,
    banner_message: typeof obj.banner_message === 'string' ? obj.banner_message : ''
  }
}

function ToggleRow({
  label,
  description,
  checked,
  danger,
  icon,
  onChange
}: {
  label: string
  description: string
  checked: boolean
  danger?: boolean
  icon: React.ReactNode
  onChange: (next: boolean) => void
}) {
  return (
    <div className={`flex items-center justify-between gap-4 rounded-2xl border p-4 sm:p-5 transition-all ${
      checked
        ? danger
          ? 'border-rose-500/30 bg-rose-500/10'
          : 'border-indigo-500/30 bg-indigo-500/10'
        : 'border-white/5 bg-[#090d16]/70 hover:border-white/10'
    }`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 p-2 rounded-xl bg-white/5 border border-white/5">{icon}</div>
        <div>
          <div className="text-sm font-semibold text-white tracking-tight">{label}</div>
          <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">{description}</div>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
          checked
            ? danger
              ? 'bg-rose-600'
              : 'bg-indigo-600'
            : 'bg-slate-700'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

function FlagsQuotasContent({
  client,
  session
}: {
  client: AdminSupabaseClient
  session: AdminSession
}) {
  const [freeLimit, setFreeLimit] = useState(DEFAULT_FREE_DAILY_LIMIT)
  const [proLimit, setProLimit] = useState(DEFAULT_PRO_DAILY_LIMIT)
  const [flags, setFlags] = useState<FeatureFlagsConfig>({ ...DEFAULT_FEATURE_FLAGS })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const loadConfig = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const configsRes = await fetchRemoteConfigsMap(client)
    if (configsRes.error) {
      setLoadError(configsRes.error)
      setStatus({
        type: 'error',
        message: `Failed to load remote flags: ${configsRes.error}. Saving is disabled to prevent overwriting live configuration.`
      })
      setLoading(false)
      return
    }
    setFreeLimit(parseLimit(configsRes.data.free_daily_limit, DEFAULT_FREE_DAILY_LIMIT))
    setProLimit(parseLimit(configsRes.data.pro_daily_limit, DEFAULT_PRO_DAILY_LIMIT))
    setFlags(parseFlags(configsRes.data.feature_flags))
    setLoading(false)
  }, [client])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  async function handleSaveAll() {
    if (loadError) return
    setSaving(true)
    setStatus(null)

    const sanitizedFlags: FeatureFlagsConfig = {
      mascot_enabled: flags.mascot_enabled,
      diagrams_enabled: flags.diagrams_enabled,
      maintenance_mode: flags.maintenance_mode,
      ...(flags.banner_message?.trim() ? { banner_message: flags.banner_message.trim() } : {})
    }

    const results = await Promise.all([
      dispatchServerConfigSync('free_daily_limit', freeLimit, session.accessToken),
      dispatchServerConfigSync('pro_daily_limit', proLimit, session.accessToken),
      dispatchServerConfigSync('feature_flags', sanitizedFlags, session.accessToken)
    ])

    setSaving(false)
    const failed = results.find((r) => !r.success)
    if (failed) {
      setStatus({ type: 'error', message: failed.error ?? 'Failed to sync flags or quotas' })
      return
    }

    setStatus({
      type: 'success',
      message: `Synced quotas (Free: ${freeLimit}/day, Pro: ${proLimit}/day) and feature_flags to Cloudflare KV.`
    })
  }

  return (
    <div className="space-y-6">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleSaveAll()}
          disabled={loading || saving || loadError !== null}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 px-5 py-2.5 text-xs font-semibold text-white transition shadow-md shadow-indigo-600/20 active:scale-[0.98]"
        >
          <Save className="size-4" />
          {saving ? 'Sincronizando con KV...' : 'Guardar Cuotas & Feature Flags'}
        </button>
      </div>

      <SectionCard
        title="Límites de Cuota Diaria (Rate Limiting)"
        description="Ajusta los topes de peticiones diarias por usuario o IP en tiempo real sin necesidad de redesplegar el Worker."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-white/5 bg-[#090d16]/70 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="free-limit" className="text-sm font-semibold text-white flex items-center gap-2">
                <Sliders className="size-4 text-sky-400" />
                Límite Diario Plan Free
              </label>
              <span className="font-mono text-sm font-bold text-sky-300 bg-sky-500/10 px-2.5 py-0.5 rounded-full border border-sky-500/20">
                {freeLimit} / día
              </span>
            </div>
            <input
              id="free-limit"
              type="range"
              min={1}
              max={100}
              value={freeLimit}
              onChange={(e) => setFreeLimit(Number(e.target.value))}
              className="w-full accent-sky-500 cursor-pointer"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400 font-mono">free_daily_limit</span>
              <input
                type="number"
                min={1}
                max={100}
                value={freeLimit}
                onChange={(e) => setFreeLimit(Math.max(1, Number(e.target.value) || 1))}
                className="w-24 rounded-xl border border-white/10 bg-[#0b1120] px-3 py-1.5 text-right font-mono text-xs text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-[#090d16]/70 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="pro-limit" className="text-sm font-semibold text-white flex items-center gap-2">
                <Sliders className="size-4 text-indigo-400" />
                Límite Diario Plan Pro
              </label>
              <span className="font-mono text-sm font-bold text-indigo-300 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20">
                {proLimit} / día
              </span>
            </div>
            <input
              id="pro-limit"
              type="range"
              min={25}
              max={2000}
              step={25}
              value={proLimit}
              onChange={(e) => setProLimit(Number(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400 font-mono">pro_daily_limit</span>
              <input
                type="number"
                min={25}
                max={2000}
                step={25}
                value={proLimit}
                onChange={(e) => setProLimit(Math.max(25, Number(e.target.value) || 25))}
                className="w-24 rounded-xl border border-white/10 bg-[#0b1120] px-3 py-1.5 text-right font-mono text-xs text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Interruptores Globales (Feature Flags)"
        description="Activa o desactiva subsistemas completos instantáneamente a nivel de Edge Worker."
      >
        <div className="space-y-3">
          <ToggleRow
            label="Chat con Mascota IA (Octocat Interactivo)"
            description="Controla si el endpoint /v1/mascot/chat y la ventana de chat flotante de la extensión aceptan mensajes."
            checked={flags.mascot_enabled}
            icon={<MessageSquare className="size-4 text-pink-400" />}
            onChange={(next) => setFlags((prev) => ({ ...prev, mascot_enabled: next }))}
          />

          <ToggleRow
            label="Diagramas de Arquitectura (Mermaid.js)"
            description="Permite que el Worker devuelva bloques Mermaid completos en el campo architectureDiagram del análisis."
            checked={flags.diagrams_enabled}
            icon={<GitBranch className="size-4 text-indigo-400" />}
            onChange={(next) => setFlags((prev) => ({ ...prev, diagrams_enabled: next }))}
          />

          <ToggleRow
            label="Modo Mantenimiento Global (Kill-Switch)"
            description="Cuando está activo, todas las consultas a /v1/analyze retornan HTTP 503 con el mensaje del banner personalizado."
            checked={flags.maintenance_mode}
            danger
            icon={<AlertOctagon className="size-4 text-rose-400" />}
            onChange={(next) => setFlags((prev) => ({ ...prev, maintenance_mode: next }))}
          />
        </div>
      </SectionCard>

      {/* Banner Superior de Avisos & Anuncios Globales */}
      <SectionCard
        title="Banner Superior de Avisos & Anuncios Globales"
        description="Configura el mensaje que se muestra en la franja superior de la extensión (Sidepanel y Popup). Úsalo para avisos a la comunidad, transmisiones en vivo o explicaciones durante mantenimiento."
      >
        <div className="rounded-2xl border border-white/5 bg-[#090d16]/70 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="banner-message" className="text-sm font-semibold text-white flex items-center gap-2">
              <Megaphone className="size-4 text-amber-400" />
              Texto del Aviso Superior (Broadcast Banner)
            </label>
            {flags.banner_message?.trim() ? (
              <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Aviso Activo en Extensión
              </span>
            ) : (
              <span className="text-[11px] text-slate-500 bg-white/5 px-2.5 py-0.5 rounded-full border border-white/5">
                Sin aviso activo (Oculto)
              </span>
            )}
          </div>

          <div className="relative">
            <input
              id="banner-message"
              type="text"
              value={flags.banner_message ?? ''}
              onChange={(e) => setFlags((prev) => ({ ...prev, banner_message: e.target.value }))}
              placeholder="Ej: Pronto estaremos en línea | Mantenimiento programado hoy a las 02:00 UTC"
              className="w-full rounded-xl border border-white/10 bg-[#0b1120] px-4 py-2.5 pr-20 text-xs text-white placeholder-slate-500 focus:border-amber-500/60 focus:outline-none transition"
            />
            {flags.banner_message ? (
              <button
                type="button"
                onClick={() => setFlags((prev) => ({ ...prev, banner_message: '' }))}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 transition flex items-center gap-1"
                title="Limpiar y ocultar aviso"
              >
                <Trash2 className="size-3" />
                Limpiar
              </button>
            ) : null}
          </div>

          <div className="text-xs text-slate-400 space-y-2">
            {flags.banner_message?.trim() ? (
              <div className="space-y-2 mt-3 pt-3 border-t border-white/5">
                <span className="text-[11px] font-medium text-slate-300">Vista previa en la extensión:</span>
                <div
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs border ${
                    flags.maintenance_mode
                      ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                  }`}
                >
                  <AlertCircle className={`size-4 shrink-0 ${flags.maintenance_mode ? 'text-rose-400' : 'text-amber-400'}`} />
                  <span className="font-medium truncate">{flags.banner_message}</span>
                  <span className="ml-auto text-[10px] uppercase font-bold tracking-wider opacity-85 shrink-0 px-2 py-0.5 rounded bg-black/20">
                    {flags.maintenance_mode ? 'Modo Mantenimiento (503)' : 'Aviso Informativo'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-slate-500 text-[11px]">
                Deja este campo en blanco si no deseas mostrar ninguna franja de aviso superior en la extensión. Recuerda presionar &quot;Guardar Cuotas &amp; Feature Flags&quot; arriba a la derecha para sincronizar los cambios.
              </p>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

export default function FeatureFlagsPage() {
  return (
    <AdminShell
      activeRoute="/flags"
      title="Cuotas Diarias & Feature Flags"
      subtitle="Ajusta límites diarios Free/Pro y conmuta interruptores globales del sistema en Cloudflare KV."
    >
      {({ client, session }) => <FlagsQuotasContent client={client} session={session} />}
    </AdminShell>
  )
}
