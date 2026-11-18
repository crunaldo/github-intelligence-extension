'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
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
  fetchRemoteConfigsMap
} from '../../lib/supabase-client'

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
): Promise<{ ok: boolean; message: string }> {
  const key = apiKey.trim()
  if (!key) return { ok: false, message: 'La clave API no puede estar vacía.' }

  try {
    if (provider === 'gemini') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash?key=${encodeURIComponent(key)}`
      )
      if (res.ok) {
        return { ok: true, message: 'Clave Gemini válida y conectada (HTTP 200)' }
      }
      const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
      return {
        ok: false,
        message: err?.error?.message ? `Gemini Error: ${err.error.message}` : `HTTP ${res.status}`
      }
    }

    if (provider === 'groq') {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${key}` }
      })
      if (res.ok) {
        return { ok: true, message: 'Clave Groq válida y conectada (HTTP 200)' }
      }
      return { ok: false, message: `Groq Error: HTTP ${res.status}` }
    }

    if (provider === 'openRouter') {
      const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { Authorization: `Bearer ${key}` }
      })
      if (res.ok) {
        return { ok: true, message: 'Clave OpenRouter válida (HTTP 200)' }
      }
      return { ok: false, message: `OpenRouter Error: HTTP ${res.status}` }
    }

    if (provider === 'cfAi') {
      return {
        ok: true,
        message: 'Cloudflare Workers AI usa binding nativo env.AI en el Worker de Edge.'
      }
    }

    return { ok: true, message: 'Clave guardada correctamente.' }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Error al verificar la clave'
    }
  }
}

function ApiKeysContent({
  client,
  session
}: {
  client: AdminSupabaseClient
  session: AdminSession
}) {
  const [config, setConfig] = useState<ProviderApiKeysConfig>({ ...DEFAULT_PROVIDER_API_KEYS })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // New Key Form State
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<ProviderName>('gemini')
  const [labelInput, setLabelInput] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({})
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

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

    const parsed = parseApiKeysConfig(configsRes.data.provider_api_keys)
    setConfig(parsed)
    setLoading(false)
  }, [client])

  useEffect(() => {
    void loadData()
  }, [loadData])

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

  async function handleSaveConfig(newConfig = config) {
    if (loadError) return
    setSaving(true)
    setStatus(null)

    const res = await dispatchServerConfigSync(
      'provider_api_keys',
      newConfig,
      session.accessToken
    )
    setSaving(false)

    if (!res.success) {
      setStatus({ type: 'error', message: res.error ?? 'Error al sincronizar llaves a Cloudflare KV' })
      return
    }

    setStatus({
      type: 'success',
      message: `¡Pool de APIs sincronizado exitosamente con Cloudflare KV! (${newConfig.keys.length} claves configuradas)`
    })
  }

  function handleAddKey(e: React.FormEvent) {
    e.preventDefault()
    const trimmedKey = keyInput.trim()
    if (!trimmedKey) return

    const newKeyItem: ApiKeyItem = {
      id: `key_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      provider: selectedProvider,
      label: labelInput.trim() || `${PROVIDER_LABELS[selectedProvider].label} #${config.keys.filter((k) => k.provider === selectedProvider).length + 1}`,
      key: trimmedKey,
      enabled: true,
      createdAt: new Date().toISOString(),
      callsCount: 0,
      errorCount: 0
    }

    const updatedConfig: ProviderApiKeysConfig = {
      ...config,
      keys: [...config.keys, newKeyItem]
    }

    setConfig(updatedConfig)
    setKeyInput('')
    setLabelInput('')
    setShowAddForm(false)
    void handleSaveConfig(updatedConfig)
  }

  function handleDeleteKey(id: string) {
    const updatedKeys = config.keys.filter((k) => k.id !== id)
    const updatedConfig = { ...config, keys: updatedKeys }
    setConfig(updatedConfig)
    void handleSaveConfig(updatedConfig)
  }

  function handleToggleKey(id: string) {
    const updatedKeys = config.keys.map((k) =>
      k.id === id ? { ...k, enabled: !k.enabled } : k
    )
    const updatedConfig = { ...config, keys: updatedKeys }
    setConfig(updatedConfig)
    void handleSaveConfig(updatedConfig)
  }

  function handleStrategyChange(strategy: KeyRotationStrategy) {
    const updatedConfig: ProviderApiKeysConfig = { ...config, strategy }
    setConfig(updatedConfig)
    void handleSaveConfig(updatedConfig)
  }

  async function handleTestKey(item: ApiKeyItem) {
    setTestingKeyId(item.id)
    const result = await verifyApiKeyDirectly(item.provider, item.key)
    setTestResults((prev) => ({ ...prev, [item.id]: result }))
    setTestingKeyId(null)
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
          icon={<KeyRound className="w-4 h-4 text-indigo-400" />}
        />
        <KpiCard
          label="Claves Gemini (Multi-Cuenta)"
          value={`${stats.byProvider.gemini.active} / ${stats.byProvider.gemini.total}`}
          hint="Rotación automática ante cuota 429"
          accent="sky"
          icon={<Zap className="w-4 h-4 text-sky-400" />}
        />
        <KpiCard
          label="Claves Groq"
          value={`${stats.byProvider.groq.active} / ${stats.byProvider.groq.total}`}
          hint="Llama 3.3 70B de alta velocidad"
          accent="emerald"
          icon={<Zap className="w-4 h-4 text-emerald-400" />}
        />
        <KpiCard
          label="Estrategia de Rotación"
          value={config.strategy === 'round_robin' ? 'Round-Robin' : 'Fallback 429'}
          hint="Gestión inteligente de cuotas y límites"
          accent="amber"
          icon={<ShieldCheck className="w-4 h-4 text-amber-400" />}
        />
      </div>

      {/* Rotation Strategy & Add Key Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-white flex items-center gap-2">
            <span>Estrategia de Rotación del Pool</span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">
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
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-white focus:border-indigo-500 focus:outline-none"
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
            onClick={() => setShowAddForm(!showAddForm)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white transition shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{showAddForm ? 'Cancelar' : 'Agregar API Key'}</span>
          </button>
        </div>
      </div>

      {/* Add New Key Form Card */}
      {showAddForm && (
        <form
          onSubmit={handleAddKey}
          className="rounded-xl border border-indigo-500/30 bg-slate-900/90 p-5 space-y-4 shadow-xl animate-fade-in"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-indigo-400" />
              Nueva Clave de API para el Pool
            </h3>
            <span className="text-xs text-slate-400">
              Soporta múltiples claves por proveedor de diferentes cuentas
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Proveedor de Inteligencia
              </label>
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value as ProviderName)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                {ALL_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABELS[p].label} ({PROVIDER_LABELS[p].model})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Etiqueta / Usuario Propietario
              </label>
              <input
                type="text"
                placeholder="ej. Gemini - Cuenta de Juan (Personal)"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Secret API Key
              </label>
              <input
                type="password"
                required
                placeholder="AIzaSy... o gsk_..."
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!keyInput.trim() || saving}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-1.5 text-xs font-semibold text-white transition"
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Recargar
          </button>
        }
      >
        {config.keys.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <KeyRound className="w-10 h-10 text-slate-600 mx-auto" />
            <div className="text-sm font-medium text-white">No hay claves de API personalizadas aún</div>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              El sistema actualmente está usando las claves de entorno configuradas por defecto en el Worker.
              Agrega una o más claves (por ejemplo varias de Gemini de distintos usuarios) para habilitar rotación
              automática de cuotas y multiplicar tu capacidad.
            </p>
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-semibold text-white transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar Primera API Key
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {config.keys.map((item, idx) => {
              const meta = PROVIDER_LABELS[item.provider]
              const isRevealed = Boolean(revealedKeys[item.id])
              const testResult = testResults[item.id]
              const isTesting = testingKeyId === item.id

              return (
                <div
                  key={item.id}
                  className={`rounded-xl border transition-all p-4 space-y-3 ${
                    item.enabled
                      ? 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                      : 'border-slate-800/50 bg-slate-950/30 opacity-60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-300">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">{item.label}</span>
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                            {meta.label}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">
                          Modelo: {meta.model}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleTestKey(item)}
                        disabled={isTesting}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-xs font-medium text-slate-200 transition"
                      >
                        <RefreshCw className={`w-3 h-3 ${isTesting ? 'animate-spin text-indigo-400' : ''}`} />
                        <span>{isTesting ? 'Probando...' : 'Probar Conexión'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleKey(item.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                          item.enabled
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'
                        }`}
                      >
                        {item.enabled ? 'Activa' : 'En Pausa'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteKey(item.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                        title="Eliminar clave"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Masked Key Display */}
                  <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
                    <span className="font-mono text-xs text-slate-300 select-all">
                      {isRevealed ? item.key : maskApiKey(item.key)}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setRevealedKeys((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                        }
                        className="p-1 rounded text-slate-400 hover:text-white"
                        title={isRevealed ? 'Ocultar clave' : 'Mostrar clave'}
                      >
                        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopyKey(item.id, item.key)}
                        className="p-1 rounded text-slate-400 hover:text-white"
                        title="Copiar clave"
                      >
                        {copiedId === item.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Test Result Banner */}
                  {testResult && (
                    <div
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                        testResult.ok
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                      }`}
                    >
                      {testResult.ok ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span>{testResult.message}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

export default function ApiKeysPage() {
  return (
    <AdminShell
      activeRoute="/apis"
      title="Gestión de APIs & Multi-Key Pool"
      subtitle="Configura múltiples API Keys por proveedor (ej. varias cuentas de Gemini), gestiona cuotas y balanceo automático."
    >
      {({ client, session }) => <ApiKeysContent client={client} session={session} />}
    </AdminShell>
  )
}
