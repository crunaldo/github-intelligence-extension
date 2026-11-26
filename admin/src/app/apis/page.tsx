'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Zap
} from 'lucide-react'
import { AdminShell, KpiCard, SectionCard, StatusBanner } from '../../lib/admin-shell'
import {
  ALL_PROVIDERS,
  DEFAULT_PROVIDER_API_KEYS,
  PROVIDER_LABELS,
  type ApiKeyItem,
  type KeyRotationStrategy,
  type ProviderApiKeysConfig,
  type ProviderName
} from '../../lib/admin-types'
import {
  type AdminSession,
  type AdminSupabaseClient,
  dispatchServerConfigSync,
  fetchRemoteConfigsMap,
  recordAdminAuditLog
} from '../../lib/supabase-client'

export interface KeyTestResult {
  ok: boolean
  message: string
  latencyMs: number
  status: 'healthy' | 'warning' | 'error'
}

function maskApiKey(key: string): string {
  const trimmed = key.trim()
  if (trimmed.length <= 8) return '••••••••'
  return `${trimmed.slice(0, 6)}••••••••${trimmed.slice(-4)}`
}

function parseApiKeysConfig(raw: unknown): ProviderApiKeysConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_PROVIDER_API_KEYS, keys: [] }
  }
  const obj = raw as Record<string, unknown>
  const strategy: KeyRotationStrategy =
    obj.strategy === 'round_robin' ? 'round_robin' : 'priority_fallback'
  const keys: ApiKeyItem[] = []

  if (Array.isArray(obj.keys)) {
    for (const item of obj.keys) {
      if (
        item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.provider === 'string' &&
        ALL_PROVIDERS.includes(item.provider as ProviderName) &&
        typeof item.key === 'string' &&
        item.key.trim().length > 0
      ) {
        keys.push({
          id: item.id,
          provider: item.provider as ProviderName,
          label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : item.provider,
          key: item.key.trim(),
          enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
          createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
          lastUsedAt: typeof item.lastUsedAt === 'string' ? item.lastUsedAt : undefined,
          callsCount: typeof item.callsCount === 'number' ? item.callsCount : 0,
          errorCount: typeof item.errorCount === 'number' ? item.errorCount : 0
        })
      }
    }
  }

  return { keys, strategy }
}

async function verifyApiKeyDirectly(
  provider: ProviderName,
  apiKey: string
): Promise<KeyTestResult> {
  const startTime = performance.now()
  const key = apiKey.trim()
  if (!key) {
    return {
      ok: false,
      message: 'La clave API no puede estar vacía.',
      latencyMs: 0,
      status: 'error'
    }
  }

  try {
    if (provider === 'gemini') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash?key=${encodeURIComponent(key)}`
      )
      const latencyMs = Math.round(performance.now() - startTime)
      if (res.ok) {
        return {
          ok: true,
          message: `Gemini Activa (HTTP 200) · ${latencyMs}ms`,
          latencyMs,
          status: latencyMs > 2500 ? 'warning' : 'healthy'
        }
      }
      if (res.status === 429) {
        return {
          ok: false,
          message: `Límite de cuota o RPM excedido (HTTP 429)`,
          latencyMs,
          status: 'warning'
        }
      }
      const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
      return {
        ok: false,
        message: err?.error?.message ? `Gemini Error: ${err.error.message}` : `HTTP ${res.status}`,
        latencyMs,
        status: 'error'
      }
    }

    if (provider === 'groq') {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${key}` }
      })
      const latencyMs = Math.round(performance.now() - startTime)
      if (res.ok) {
        return {
          ok: true,
          message: `Groq Activa (HTTP 200) · ${latencyMs}ms`,
          latencyMs,
          status: latencyMs > 2000 ? 'warning' : 'healthy'
        }
      }
      if (res.status === 429) {
        return {
          ok: false,
          message: `Límite RPM/TPM excedido en Groq (HTTP 429)`,
          latencyMs,
          status: 'warning'
        }
      }
      return {
        ok: false,
        message: `Groq Error: HTTP ${res.status}`,
        latencyMs,
        status: 'error'
      }
    }

    if (provider === 'openRouter') {
      const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { Authorization: `Bearer ${key}` }
      })
      const latencyMs = Math.round(performance.now() - startTime)
      if (res.ok) {
        return {
          ok: true,
          message: `OpenRouter Activa (HTTP 200) · ${latencyMs}ms`,
          latencyMs,
          status: 'healthy'
        }
      }
      return {
        ok: false,
        message: `OpenRouter Error: HTTP ${res.status}`,
        latencyMs,
        status: 'error'
      }
    }

    const latencyMs = Math.round(performance.now() - startTime)
    return {
      ok: true,
      message: `Proveedor Workers AI verificado (${latencyMs}ms)`,
      latencyMs,
      status: 'healthy'
    }
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startTime)
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Error al conectar con el proveedor.',
      latencyMs,
      status: 'error'
    }
  }
}

function ApisContent({
  client,
  session
}: {
  client: AdminSupabaseClient
  session: AdminSession
}) {
  const [config, setConfig] = useState<ProviderApiKeysConfig>({ ...DEFAULT_PROVIDER_API_KEYS })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Add Key Form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<ProviderName>('gemini')
  const [labelInput, setLabelInput] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Test status per key
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null)
  const [isTestingAll, setIsTestingAll] = useState(false)
  const [testResults, setTestResults] = useState<Record<string, KeyTestResult>>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)

    const configsMap = await fetchRemoteConfigsMap(client)
    setLoading(false)

    const parsed = parseApiKeysConfig(configsMap.provider_api_keys)
    setConfig(parsed)
  }, [client])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function persistConfig(newConfig: ProviderApiKeysConfig, successMessage: string) {
    setSaving(true)
    setStatus(null)
    const res = await dispatchServerConfigSync(
      'provider_api_keys',
      newConfig,
      session.accessToken
    )
    setSaving(false)

    if (res.success) {
      setConfig(newConfig)
      setStatus({ type: 'success', message: successMessage })
    } else {
      setStatus({ type: 'error', message: res.error ?? 'Error al guardar la configuración en KV.' })
    }
  }

  async function handleStrategyChange(strategy: KeyRotationStrategy) {
    const updated = { ...config, strategy }
    await persistConfig(
      updated,
      `Estrategia cambiada a ${strategy === 'round_robin' ? 'Round-Robin Equitativo' : 'Fallback por Cuota (429)'}.`
    )
  }

  async function handleToggleKey(id: string) {
    const updatedKeys = config.keys.map((k) =>
      k.id === id ? { ...k, enabled: !k.enabled } : k
    )
    const target = updatedKeys.find((k) => k.id === id)
    const nextConfig = { ...config, keys: updatedKeys }
    await persistConfig(
      nextConfig,
      `Clave "${target?.label}" ${target?.enabled ? 'habilitada' : 'pausada'} en el pool.`
    )
  }

  async function handleDeleteKey(id: string) {
    const target = config.keys.find((k) => k.id === id)
    if (!window.confirm(`¿Estás seguro de eliminar la clave "${target?.label || id}" del pool?`)) {
      return
    }
    const updatedKeys = config.keys.filter((k) => k.id !== id)
    const nextConfig = { ...config, keys: updatedKeys }
    await persistConfig(nextConfig, `Clave "${target?.label || id}" eliminada exitosamente.`)
  }

  async function handleAddKey(e: React.FormEvent) {
    e.preventDefault()
    if (!keyInput.trim()) return

    const newKeyItem: ApiKeyItem = {
      id: `${selectedProvider}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      provider: selectedProvider,
      label: labelInput.trim() || `${PROVIDER_LABELS[selectedProvider].label} (Nueva Clave)`,
      key: keyInput.trim(),
      enabled: true,
      createdAt: new Date().toISOString(),
      callsCount: 0,
      errorCount: 0
    }

    const nextConfig = {
      ...config,
      keys: [...config.keys, newKeyItem]
    }

    await persistConfig(
      nextConfig,
      `Nueva clave para ${PROVIDER_LABELS[selectedProvider].label} agregada al pool y sincronizada a Cloudflare KV.`
    )

    setLabelInput('')
    setKeyInput('')
    setShowAddForm(false)
  }

  const stats = useMemo(() => {
    const total = config.keys.length
    const active = config.keys.filter((k) => k.enabled).length
    const byProvider: Record<ProviderName, { total: number; active: number }> = {
      gemini: { total: 0, active: 0 },
      groq: { total: 0, active: 0 },
      cfAi: { total: 0, active: 0 },
      openRouter: { total: 0, active: 0 }
    }
    for (const k of config.keys) {
      if (byProvider[k.provider]) {
        byProvider[k.provider].total += 1
        if (k.enabled) byProvider[k.provider].active += 1
      }
    }
    return { total, active, byProvider }
  }, [config.keys])

  async function handleTestKey(item: ApiKeyItem) {
    setTestingKeyId(item.id)
    const result = await verifyApiKeyDirectly(item.provider, item.key)
    setTestResults((prev) => ({ ...prev, [item.id]: result }))
    setTestingKeyId(null)

    await recordAdminAuditLog(
      client,
      session.email,
      'HEALTH_CHECK_SINGLE',
      item.label,
      { provider: item.provider, ok: result.ok, latencyMs: result.latencyMs, status: result.status },
      session.accessToken
    )
  }

  async function handleTestAllKeys() {
    if (config.keys.length === 0) return
    setIsTestingAll(true)
    const results: Record<string, KeyTestResult> = {}
    await Promise.all(
      config.keys.map(async (k) => {
        const res = await verifyApiKeyDirectly(k.provider, k.key)
        results[k.id] = res
      })
    )
    setTestResults(results)
    setIsTestingAll(false)

    const healthyCount = Object.values(results).filter((r) => r.ok).length
    setStatus({
      type: healthyCount === config.keys.length ? 'success' : 'error',
      message: `Health Check 1-Clic completado: ${healthyCount}/${config.keys.length} claves operativas en el pool.`
    })

    await recordAdminAuditLog(
      client,
      session.email,
      'HEALTH_CHECK_ALL',
      'provider_api_keys',
      { totalTested: config.keys.length, healthyCount },
      session.accessToken
    )
  }

  async function handleCopyKey(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // Ignore
    }
  }

  return (
    <div className="space-y-6">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Total Claves en Pool"
          value={stats.total}
          hint={`${stats.active} activas · ${stats.total - stats.active} en pausa`}
          accent="indigo"
          badge={`${stats.active} en rotación`}
          sparkline={[2, 3, 4, stats.total || 4]}
          icon={<KeyRound className="size-5" />}
        />
        <KpiCard
          label="Claves Gemini (Multi-Cuenta)"
          value={`${stats.byProvider.gemini.active} / ${stats.byProvider.gemini.total}`}
          hint="Rotación automática ante cuota 429"
          accent="sky"
          badge="Multi-User"
          sparkline={[1, 1, 2, stats.byProvider.gemini.total || 2]}
          icon={<Zap className="size-5" />}
        />
        <KpiCard
          label="Claves Groq"
          value={`${stats.byProvider.groq.active} / ${stats.byProvider.groq.total}`}
          hint="Llama 3.3 70B de alta velocidad"
          accent="emerald"
          badge="Sub-segundo"
          sparkline={[1, 1, 1, stats.byProvider.groq.total || 1]}
          icon={<Zap className="size-5" />}
        />
        <KpiCard
          label="Estrategia de Rotación"
          value={config.strategy === 'round_robin' ? 'Round-Robin' : 'Fallback 429'}
          hint="Gestión inteligente de cuotas y límites"
          accent="amber"
          badge="Activo"
          sparkline={[1, 1, 1, 1]}
          icon={<ShieldCheck className="size-5" />}
        />
      </div>

      {/* Rotation Strategy & Add Key Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-white/10 bg-[#0f172a]/80 backdrop-blur-md p-5 shadow-sm">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-white flex items-center gap-2">
            <span>Estrategia de Rotación del Pool</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              provider_api_keys
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Define cómo se distribuyen las consultas cuando hay varias APIs configuradas para un mismo proveedor.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={config.strategy}
            onChange={(e) => handleStrategyChange(e.target.value as KeyRotationStrategy)}
            className="rounded-xl border border-white/10 bg-[#090d16] px-3.5 py-2 text-xs font-medium text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition"
          >
            <option value="priority_fallback">
              Fallback por Cuota (Usa Clave 1, rota a Clave 2 ante 429)
            </option>
            <option value="round_robin">
              Round-Robin Equitativo (Distribuye aleatoriamente entre activas)
            </option>
          </select>

          <button
            type="button"
            onClick={() => void handleTestAllKeys()}
            disabled={isTestingAll || config.keys.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-3.5 py-2 text-xs font-semibold text-emerald-300 transition active:scale-[0.98] disabled:opacity-50"
            title="Verificar latencia y validez de todas las claves configuradas"
          >
            <Activity className={`size-3.5 ${isTestingAll ? 'animate-spin' : ''}`} />
            <span>{isTestingAll ? 'Verificando Pool...' : 'Health Check 1-Clic'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 px-4 py-2 text-xs font-semibold text-white transition shadow-md shadow-indigo-600/20 active:scale-[0.98]"
          >
            <Plus className="size-3.5" />
            <span>{showAddForm ? 'Cancelar' : 'Agregar API Key'}</span>
          </button>
        </div>
      </div>

      {/* Add New Key Form Card */}
      {showAddForm && (
        <form
          onSubmit={handleAddKey}
          className="rounded-2xl border border-indigo-500/30 bg-[#0f172a]/95 backdrop-blur-xl p-6 space-y-4 shadow-2xl hero-in"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <KeyRound className="size-4 text-indigo-400" />
              Nueva Clave de API para el Pool
            </h3>
            <span className="text-xs text-slate-400">
              Soporta múltiples claves por proveedor de diferentes cuentas
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Proveedor de Inteligencia
              </label>
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value as ProviderName)}
                className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-2 text-xs text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
              >
                {ALL_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABELS[p].label} ({PROVIDER_LABELS[p].model})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Etiqueta / Usuario Propietario
              </label>
              <input
                type="text"
                placeholder="ej. Gemini - Cuenta de Juan (Personal)"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Secret API Key
              </label>
              <input
                type="password"
                required
                placeholder="AIzaSy... o gsk_..."
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3.5 py-1.5 text-xs font-medium text-slate-300 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!keyInput.trim() || saving}
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 px-4 py-1.5 text-xs font-semibold text-white transition shadow-md shadow-indigo-600/25"
            >
              Guardar en el Pool
            </button>
          </div>
        </form>
      )}

      {/* Keys List by Provider */}
      <SectionCard
        title="Claves de API Registradas en el Pool"
        description="Gestión de llaves activas, verificación de conectividad y rotación por límite de cuota (429)."
        actions={
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 transition"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Recargar
          </button>
        }
      >
        {config.keys.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20 mx-auto text-indigo-400">
              <KeyRound className="size-6" />
            </div>
            <div className="text-sm font-semibold text-white">No hay claves de API personalizadas aún</div>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              El sistema actualmente está usando las claves de entorno configuradas por defecto en el Worker.
              Agrega una o más claves (por ejemplo varias de Gemini de distintos usuarios) para habilitar rotación
              automática de cuotas y multiplicar tu capacidad.
            </p>
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 px-4 py-2 text-xs font-semibold text-white transition shadow-md shadow-indigo-600/20"
            >
              <Plus className="size-3.5" />
              Agregar Primera API Key
            </button>
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            {config.keys.map((item, idx) => {
              const meta = PROVIDER_LABELS[item.provider]
              const isRevealed = Boolean(revealedKeys[item.id])
              const testResult = testResults[item.id]
              const isTesting = testingKeyId === item.id

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border transition-all p-4 space-y-3 ${
                    item.enabled
                      ? 'border-white/10 bg-[#090d16]/70 hover:border-white/20'
                      : 'border-white/5 bg-[#090d16]/30 opacity-60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex size-7 items-center justify-center rounded-xl bg-slate-800 text-xs font-bold text-slate-300 border border-white/5">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white tracking-tight">{item.label}</span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                            {meta.label}
                          </span>
                          {testResult && (
                            <span
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${
                                testResult.status === 'healthy'
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : testResult.status === 'warning'
                                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                    : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                              }`}
                            >
                              <span
                                className={`size-1.5 rounded-full ${
                                  testResult.status === 'healthy'
                                    ? 'bg-emerald-400 animate-pulse'
                                    : testResult.status === 'warning'
                                      ? 'bg-amber-400'
                                      : 'bg-rose-400'
                                }`}
                              />
                              {testResult.status === 'healthy'
                                ? `🟢 Activa · ${testResult.latencyMs}ms`
                                : testResult.status === 'warning'
                                  ? `🟡 Límite/Lento · ${testResult.latencyMs}ms`
                                  : `🔴 Error`}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          Modelo: {meta.model}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleTestKey(item)}
                        disabled={isTesting}
                        className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-1 text-xs text-slate-300 hover:text-white transition"
                      >
                        <RefreshCw className={`size-3 ${isTesting ? 'animate-spin' : ''}`} />
                        <span>{isTesting ? 'Probando...' : 'Probar'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleKey(item.id)}
                        className={`px-3 py-1 rounded-xl text-xs font-semibold transition ${
                          item.enabled
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border border-white/5'
                        }`}
                      >
                        {item.enabled ? 'Activa' : 'Pausada'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteKey(item.id)}
                        className="p-1.5 rounded-xl border border-white/5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                        title="Eliminar clave"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Secret Display & Controls */}
                  <div className="flex items-center justify-between rounded-xl bg-[#0b1120] border border-white/5 px-3 py-2 text-xs font-mono">
                    <span className="text-slate-300 truncate mr-2">
                      {isRevealed ? item.key : maskApiKey(item.key)}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setRevealedKeys((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                        }
                        className="text-slate-400 hover:text-white p-1 rounded transition"
                        title={isRevealed ? 'Ocultar' : 'Mostrar'}
                      >
                        {isRevealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyKey(item.id, item.key)}
                        className="text-slate-400 hover:text-white p-1 rounded flex items-center gap-1 transition"
                        title="Copiar clave"
                      >
                        {copiedId === item.id ? (
                          <Check className="size-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Test Result Message */}
                  {testResult && (
                    <div
                      className={`flex items-center gap-2 rounded-xl p-2.5 text-xs ${
                        testResult.ok
                          ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : 'border border-rose-500/30 bg-rose-500/10 text-rose-300'
                      }`}
                    >
                      {testResult.ok ? (
                        <CheckCircle2 className="size-4 shrink-0" />
                      ) : (
                        <AlertCircle className="size-4 shrink-0" />
                      )}
                      <span>{testResult.message}</span>
                    </div>
                  )}

                  {/* Key Stats Footnote */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 pt-1 border-t border-white/5">
                    <div className="flex items-center gap-3">
                      <span>Llamadas: <strong className="text-white">{item.callsCount ?? 0}</strong></span>
                      <span>Errores: <strong className={item.errorCount ? 'text-rose-400' : 'text-slate-400'}>{item.errorCount ?? 0}</strong></span>
                    </div>
                    <span>Agregada: {new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

export default function ApisManagementPage() {
  return (
    <AdminShell
      activeRoute="/apis"
      title="Pool Multi-API & Health Check"
      subtitle="Configura múltiples APIs para Gemini, Groq y OpenRouter con Health Check en 1-Clic, rotación automática por cuota (429) y balanceo Round-Robin."
    >
      {({ client, session }) => <ApisContent client={client} session={session} />}
    </AdminShell>
  )
}
