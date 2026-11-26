'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  Bell,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Globe,
  MessageSquare,
  RefreshCw,
  Save,
  Send,
  Server,
  ShieldCheck,
  Zap
} from 'lucide-react'
import { AdminShell, KpiCard, SectionCard, StatusBanner } from '../../lib/admin-shell'
import {
  DEFAULT_ADVANCED_SETTINGS,
  DEFAULT_NEW_USER_TIER,
  DEFAULT_TELEGRAM_ALERTS_CONFIG,
  type AdvancedSystemSettings,
  type DefaultUserTier,
  type TelegramAlertsConfig
} from '../../lib/admin-types'
import {
  type AdminSession,
  type AdminSupabaseClient,
  dispatchServerConfigSync,
  fetchRemoteConfigsMap,
  recordAdminAuditLog
} from '../../lib/supabase-client'

function parseSettings(raw: unknown): AdvancedSystemSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_ADVANCED_SETTINGS }
  }
  const obj = raw as Record<string, unknown>
  return {
    ipDailyCeiling:
      typeof obj.ipDailyCeiling === 'number' && obj.ipDailyCeiling > 0
        ? obj.ipDailyCeiling
        : DEFAULT_ADVANCED_SETTINGS.ipDailyCeiling,
    headCacheTtlHours:
      typeof obj.headCacheTtlHours === 'number' && obj.headCacheTtlHours > 0
        ? obj.headCacheTtlHours
        : DEFAULT_ADVANCED_SETTINGS.headCacheTtlHours,
    commitCacheTtlHours:
      typeof obj.commitCacheTtlHours === 'number' && obj.commitCacheTtlHours > 0
        ? obj.commitCacheTtlHours
        : DEFAULT_ADVANCED_SETTINGS.commitCacheTtlHours,
    providerTimeoutMs:
      typeof obj.providerTimeoutMs === 'number' && obj.providerTimeoutMs > 0
        ? obj.providerTimeoutMs
        : DEFAULT_ADVANCED_SETTINGS.providerTimeoutMs,
    logIpHashes:
      typeof obj.logIpHashes === 'boolean'
        ? obj.logIpHashes
        : DEFAULT_ADVANCED_SETTINGS.logIpHashes,
    logFingerprints:
      typeof obj.logFingerprints === 'boolean'
        ? obj.logFingerprints
        : DEFAULT_ADVANCED_SETTINGS.logFingerprints,
    preferredGeminiModel:
      typeof obj.preferredGeminiModel === 'string' && obj.preferredGeminiModel
        ? obj.preferredGeminiModel
        : DEFAULT_ADVANCED_SETTINGS.preferredGeminiModel,
    preferredGroqModel:
      typeof obj.preferredGroqModel === 'string' && obj.preferredGroqModel
        ? obj.preferredGroqModel
        : DEFAULT_ADVANCED_SETTINGS.preferredGroqModel
  }
}

function SettingsContent({
  client,
  session
}: {
  client: AdminSupabaseClient
  session: AdminSession
}) {
  const [settings, setSettings] = useState<AdvancedSystemSettings>({
    ...DEFAULT_ADVANCED_SETTINGS
  })
  const [defaultTier, setDefaultTier] = useState<DefaultUserTier>(DEFAULT_NEW_USER_TIER)
  const [telegram, setTelegram] = useState<TelegramAlertsConfig>({
    ...DEFAULT_TELEGRAM_ALERTS_CONFIG
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [testingHealth, setTestingHealth] = useState(false)
  const [healthStatus, setHealthStatus] = useState<{ ok: boolean; details: string } | null>(null)
  const [testingTelegram, setTestingTelegram] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const configsRes = await fetchRemoteConfigsMap(client)
    if (configsRes.error) {
      setLoadError(configsRes.error)
      setStatus({
        type: 'error',
        message: `Error al cargar configuración: ${configsRes.error}`
      })
      setLoading(false)
      return
    }

    const parsed = parseSettings(configsRes.data.advanced_system_settings)
    setSettings(parsed)

    const rawTier =
      configsRes.data['default_new_user_tier'] || configsRes.data['default_user_role']
    if (rawTier === 'pro' || rawTier === 'free') {
      setDefaultTier(rawTier)
    }

    if (configsRes.data.telegram_alerts && typeof configsRes.data.telegram_alerts === 'object') {
      const tg = configsRes.data.telegram_alerts as Partial<TelegramAlertsConfig>
      setTelegram({
        ...DEFAULT_TELEGRAM_ALERTS_CONFIG,
        ...tg
      })
    }

    setLoading(false)
  }, [client])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function handleSaveSettings() {
    if (loadError) return
    setSaving(true)
    setStatus(null)

    const [settingsRes, tierRes, tgRes] = await Promise.all([
      dispatchServerConfigSync('advanced_system_settings', settings, session.accessToken),
      dispatchServerConfigSync('default_new_user_tier', defaultTier, session.accessToken),
      dispatchServerConfigSync('telegram_alerts', telegram, session.accessToken)
    ])
    setSaving(false)

    if (!settingsRes.success || !tierRes.success || !tgRes.success) {
      const errorMsg = [settingsRes.error, tierRes.error, tgRes.error].filter(Boolean).join(' | ')
      setStatus({ type: 'error', message: errorMsg || 'Error al guardar configuraciones' })
      return
    }

    await recordAdminAuditLog(
      client,
      session.email,
      'SETTINGS_SAVED',
      'system_settings',
      { defaultTier, telegramEnabled: telegram.enabled },
      session.accessToken
    )

    setStatus({
      type: 'success',
      message: '¡Configuraciones avanzadas, rol inicial y alertas de Telegram guardadas exitosamente!'
    })
  }

  async function handleTestTelegram() {
    if (!telegram.botToken.trim() || !telegram.chatId.trim()) {
      setStatus({
        type: 'error',
        message: 'Debes ingresar el Bot Token y el Chat ID de Telegram para enviar la prueba.'
      })
      return
    }

    setTestingTelegram(true)
    setStatus(null)

    try {
      const text = `🤖 *GitHub Intelligence Assistant*\n\n✅ *¡Conexión con el Panel de Administración Exitosa!*\n🕒 *Fecha:* \`${new Date().toLocaleString()}\`\n👤 *Admin:* \`${session.email}\`\n\n_Tu bot de Telegram está recibiendo alertas críticas del sistema en vivo._`
      const res = await fetch(
        `https://api.telegram.org/bot${telegram.botToken.trim()}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegram.chatId.trim(),
            text,
            parse_mode: 'Markdown'
          })
        }
      )
      const data = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null
      if (res.ok && data?.ok) {
        setStatus({
          type: 'success',
          message: '¡Alerta de prueba enviada a Telegram con éxito! Revisa tu chat o canal.'
        })
        await recordAdminAuditLog(
          client,
          session.email,
          'TELEGRAM_TEST_SUCCESS',
          telegram.chatId,
          'Mensaje de prueba enviado exitosamente',
          session.accessToken
        )
      } else {
        setStatus({
          type: 'error',
          message: `Telegram Error: ${data?.description || `HTTP ${res.status}`}`
        })
      }
    } catch (err) {
      setStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error al conectar con la API de Telegram.'
      })
    } finally {
      setTestingTelegram(false)
    }
  }

  async function handleTestHealth() {
    setTestingHealth(true)
    setHealthStatus(null)

    try {
      const start = Date.now()
      const { error } = await client.from('remote_configs').select('count').limit(1)
      const duration = Date.now() - start

      if (error) {
        setHealthStatus({ ok: false, details: `Supabase Error: ${error.message}` })
      } else {
        setHealthStatus({
          ok: true,
          details: `Conexión a Supabase y Cloudflare Pages OK (${duration} ms). Base de datos y Edge Workers operativos.`
        })
      }
    } catch (err) {
      setHealthStatus({
        ok: false,
        details: err instanceof Error ? err.message : 'Fallo en diagnóstico de red'
      })
    } finally {
      setTestingHealth(false)
    }
  }

  return (
    <div className="space-y-6">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleSaveSettings()}
          disabled={loading || saving || loadError !== null}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 px-5 py-2.5 text-xs font-semibold text-white transition shadow-md shadow-indigo-600/20 active:scale-[0.98]"
        >
          <Save className="size-4" />
          {saving ? 'Sincronizando...' : 'Guardar Configuraciones'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cache & Performance Settings */}
        <SectionCard
          title="Gestión de Caché & Tiempos de Vida (TTL)"
          description="Controla la expiración de análisis en Cloudflare KV y Supabase"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                TTL para Rama Principal / HEAD (Horas)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={72}
                  value={settings.headCacheTtlHours}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      headCacheTtlHours: Math.max(1, Number(e.target.value) || 1)
                    }))
                  }
                  className="w-28 rounded-xl border border-white/10 bg-[#090d16] px-3.5 py-2 text-xs font-mono text-white focus:border-indigo-500 focus:outline-none"
                />
                <span className="text-xs text-slate-400">
                  Validez recomendada: 1 - 6 horas para repositorios activos.
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                TTL para Commits Inmutables (Horas)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={settings.commitCacheTtlHours}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      commitCacheTtlHours: Math.max(1, Number(e.target.value) || 24)
                    }))
                  }
                  className="w-28 rounded-xl border border-white/10 bg-[#090d16] px-3.5 py-2 text-xs font-mono text-white focus:border-indigo-500 focus:outline-none"
                />
                <span className="text-xs text-slate-400">
                  Un commit SHA es inmutable; puede cachearse 24h a 720h (30 días).
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Timeout de Llamada por Proveedor IA (Milisegundos)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={3000}
                  max={60000}
                  step={1000}
                  value={settings.providerTimeoutMs}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      providerTimeoutMs: Math.max(1000, Number(e.target.value) || 15000)
                    }))
                  }
                  className="w-28 rounded-xl border border-white/10 bg-[#090d16] px-3.5 py-2 text-xs font-mono text-white focus:border-indigo-500 focus:outline-none"
                />
                <span className="text-xs text-slate-400">
                  Tiempo máximo de espera antes de activar el siguiente proveedor de fallback.
                </span>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Rate Limiting & Anti-Abuse */}
        <SectionCard
          title="Seguridad, Anti-Abuso & Modelos IA"
          description="Límites máximos por IP y selección de modelos predeterminados"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Límite Diario por Dirección IP (IP Ceiling)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={10}
                  max={500}
                  value={settings.ipDailyCeiling}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      ipDailyCeiling: Math.max(1, Number(e.target.value) || 45)
                    }))
                  }
                  className="w-28 rounded-xl border border-white/10 bg-[#090d16] px-3.5 py-2 text-xs font-mono text-white focus:border-indigo-500 focus:outline-none"
                />
                <span className="text-xs text-slate-400">
                  Protege contra bots o usuarios anónimos rotando identidades locales.
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Modelo Predeterminado de Gemini
              </label>
              <select
                value={settings.preferredGeminiModel}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, preferredGeminiModel: e.target.value }))
                }
                className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="gemini-2.0-flash">gemini-2.0-flash (Recomendado: ultra rápido)</option>
                <option value="gemini-2.5-flash">gemini-2.5-flash (Última generación)</option>
                <option value="gemini-1.5-pro">gemini-1.5-pro (Máxima capacidad de razonamiento)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Modelo Predeterminado de Groq
              </label>
              <select
                value={settings.preferredGroqModel}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, preferredGroqModel: e.target.value }))
                }
                className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="llama-3.3-70b-versatile">
                  llama-3.3-70b-versatile (Recomendado: versatilidad & arquitectura)
                </option>
                <option value="llama-3.1-8b-instant">llama-3.1-8b-instant (Sub-segundo)</option>
              </select>
            </div>
          </div>
        </SectionCard>

        {/* Default New User Tier Setting */}
        <SectionCard
          title="Membresía Inicial para Nuevos Registros"
          description="Define qué rol o nivel reciben automáticamente los nuevos usuarios"
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Rol / Plan por Defecto
              </label>
              <select
                value={defaultTier}
                onChange={(e) => setDefaultTier(e.target.value as DefaultUserTier)}
                className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3.5 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="free">Free (Plan Gratuito - Por defecto)</option>
                <option value="pro">Pro (Plan Profesional - Acceso Completo)</option>
              </select>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Sincronizado con la política global en Cloudflare KV y Supabase. Si eliges{' '}
                <strong className="text-white">Pro</strong>, las nuevas cuentas se activarán con privilegios Pro automáticamente.
              </p>
            </div>
          </div>
        </SectionCard>

        {/* Telegram Webhook & Bot Alerts Card */}
        <SectionCard
          title="Alertas & Webhook de Telegram"
          description="Recibe alertas críticas instantáneas en tu bot o canal privado de Telegram cuando ocurren fallbacks o picos de error"
          icon={<Bell className="size-4 text-sky-400" />}
          actions={
            <button
              type="button"
              onClick={() => void handleTestTelegram()}
              disabled={testingTelegram || !telegram.botToken || !telegram.chatId}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-300 transition disabled:opacity-50"
              title="Enviar mensaje de prueba a Telegram"
            >
              <Send className={`size-3.5 ${testingTelegram ? 'animate-spin' : ''}`} />
              <span>{testingTelegram ? 'Enviando...' : 'Enviar Alerta de Prueba'}</span>
            </button>
          }
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-[#090d16]">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-white">Activar Alertas de Telegram</span>
                <p className="text-[11px] text-slate-400">
                  Envía avisos de telemetría y seguridad en vivo al canal configurado.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={telegram.enabled}
                  onChange={(e) => setTelegram((prev) => ({ ...prev, enabled: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Telegram Bot Token (@BotFather)
                </label>
                <input
                  type="password"
                  placeholder="ej. 123456789:ABCdefGhI..."
                  value={telegram.botToken}
                  onChange={(e) => setTelegram((prev) => ({ ...prev, botToken: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-2 text-xs font-mono text-white placeholder-slate-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Chat ID o Canal (@nombre o ID numérico)
                </label>
                <input
                  type="text"
                  placeholder="ej. -1001234567890 o @mi_canal"
                  value={telegram.chatId}
                  onChange={(e) => setTelegram((prev) => ({ ...prev, chatId: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-2 text-xs font-mono text-white placeholder-slate-500"
                />
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-white/5">
              <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
                Eventos para Notificar a Telegram
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={telegram.notifyOnAiFallback}
                    onChange={(e) => setTelegram((prev) => ({ ...prev, notifyOnAiFallback: e.target.checked }))}
                    className="rounded border-white/10 bg-[#090d16] text-sky-500"
                  />
                  <span>⚡ Fallback de IA activado (failover de cuota)</span>
                </label>
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={telegram.notifyOnNewProSubscriber}
                    onChange={(e) => setTelegram((prev) => ({ ...prev, notifyOnNewProSubscriber: e.target.checked }))}
                    className="rounded border-white/10 bg-[#090d16] text-sky-500"
                  />
                  <span>💎 Nuevo Suscriptor Pro registrado</span>
                </label>
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={telegram.notifyOnErrorSpike}
                    onChange={(e) => setTelegram((prev) => ({ ...prev, notifyOnErrorSpike: e.target.checked }))}
                    className="rounded border-white/10 bg-[#090d16] text-sky-500"
                  />
                  <span>🚨 Pico de Errores &gt; 10% en 5 min</span>
                </label>
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={telegram.notifyOnBan}
                    onChange={(e) => setTelegram((prev) => ({ ...prev, notifyOnBan: e.target.checked }))}
                    className="rounded border-white/10 bg-[#090d16] text-sky-500"
                  />
                  <span>🛑 Baneo automático de IP por abuso</span>
                </label>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Live Diagnostics Card */}
        <SectionCard
          title="Diagnóstico & Verificación de Estado del Sistema"
          description="Prueba la conectividad en vivo con la base de datos Supabase y Cloudflare KV"
          actions={
            <button
              type="button"
              onClick={() => void handleTestHealth()}
              disabled={testingHealth}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 transition"
            >
              <RefreshCw className={`size-3.5 ${testingHealth ? 'animate-spin' : ''}`} />
              Ejecutar Diagnóstico
            </button>
          }
        >
          {healthStatus && (
            <div
              className={`flex items-center gap-2.5 rounded-2xl border p-4 text-xs hero-in ${
                healthStatus.ok
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
              }`}
            >
              {healthStatus.ok ? (
                <CheckCircle2 className="size-5 shrink-0" />
              ) : (
                <Server className="size-5 shrink-0" />
              )}
              <span className="font-medium leading-relaxed">{healthStatus.details}</span>
            </div>
          )}

          {!healthStatus && (
            <p className="text-xs text-slate-400 py-2">
              Haz clic en &quot;Ejecutar Diagnóstico&quot; para comprobar latencia y conectividad en tiempo real.
            </p>
          )}
        </SectionCard>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <AdminShell
      activeRoute="/settings"
      title="Configuraciones Avanzadas del Sistema"
      subtitle="Ajusta políticas de caché, tiempos de espera, límites por IP y diagnósticos de conectividad."
    >
      {({ client, session }) => <SettingsContent client={client} session={session} />}
    </AdminShell>
  )
}
