'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Cpu,
  Download,
  Filter,
  Gauge,
  GripVertical,
  Radio,
  RefreshCw,
  Save,
  Search,
  Zap
} from 'lucide-react'
import { AdminShell, KpiCard, SectionCard, StatusBanner } from '../lib/admin-shell'
import {
  ALL_PROVIDERS,
  PROVIDER_LABELS,
  type ProviderName,
  type QueryLogRow
} from '../lib/admin-types'
import {
  type AdminSession,
  type AdminSupabaseClient,
  dispatchServerConfigSync,
  fetchRecentQueryLogs,
  fetchRemoteConfigsMap
} from '../lib/supabase-client'

interface DailyBucket {
  date: string
  freeCount: number
  proCount: number
}

interface ProviderStat {
  provider: ProviderName
  calls: number
  avgLatencyMs: number
  sharePct: number
}

function normalizeProviderPriority(raw: unknown): ProviderName[] {
  if (!Array.isArray(raw)) {
    return [...ALL_PROVIDERS]
  }
  const seen = new Set<ProviderName>()
  for (const item of raw) {
    if (typeof item === 'string' && ALL_PROVIDERS.includes(item as ProviderName)) {
      seen.add(item as ProviderName)
    }
  }
  for (const provider of ALL_PROVIDERS) {
    if (!seen.has(provider)) {
      seen.add(provider)
    }
  }
  return Array.from(seen)
}

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil((percentile / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))] ?? 0
}

function formatRelativeTime(dateStr: string): string {
  const diffSec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diffSec < 5) return 'justo ahora'
  if (diffSec < 60) return `hace ${diffSec}s`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `hace ${diffMin}m`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `hace ${diffHours}h`
  return `hace ${Math.floor(diffHours / 24)}d`
}

function DashboardContent({
  client,
  session
}: {
  client: AdminSupabaseClient
  session: AdminSession
}) {
  const [logs, setLogs] = useState<QueryLogRow[]>([])
  const [priority, setPriority] = useState<ProviderName[]>([...ALL_PROVIDERS])
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Live telemetry state
  const [liveInterval, setLiveInterval] = useState<number>(0) // 0 = manual, 5000, 10000, 30000
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date())

  // Query Feed Filters
  const [searchRepo, setSearchRepo] = useState('')
  const [filterProvider, setFilterProvider] = useState<string>('all')
  const [filterTier, setFilterTier] = useState<'all' | 'free' | 'pro'>('all')
  const [filterCache, setFilterCache] = useState<'all' | 'hit' | 'miss'>('all')
  const [timeWindow, setTimeWindow] = useState<'1h' | '24h' | '7d' | 'all'>('all')

  const loadData = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setLoading(true)
      setLoadError(null)
      const [logsRes, configsRes] = await Promise.all([
        fetchRecentQueryLogs(client, 1000),
        fetchRemoteConfigsMap(client)
      ])

      const errors = [logsRes.error, configsRes.error].filter(Boolean)
      if (errors.length > 0) {
        const msg = errors.join(' | ')
        setLoadError(msg)
        if (!isBackground) {
          setStatus({ type: 'error', message: `Fallo al cargar datos de telemetría: ${msg}` })
        }
      }

      setLogs(logsRes.data)
      setLastRefreshedAt(new Date())
      if (!configsRes.error) {
        setPriority(normalizeProviderPriority(configsRes.data.provider_priority))
      }
      if (!isBackground) setLoading(false)
    },
    [client]
  )

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Live Polling Effect
  useEffect(() => {
    if (liveInterval <= 0) return
    const timer = setInterval(() => {
      void loadData(true)
    }, liveInterval)
    return () => clearInterval(timer)
  }, [liveInterval, loadData])

  // Filtered Logs based on time window
  const timeFilteredLogs = useMemo(() => {
    if (timeWindow === 'all') return logs
    const now = Date.now()
    const msLimit =
      timeWindow === '1h'
        ? 60 * 60 * 1000
        : timeWindow === '24h'
          ? 24 * 60 * 60 * 1000
          : 7 * 24 * 60 * 60 * 1000

    return logs.filter((l) => now - new Date(l.created_at).getTime() <= msLimit)
  }, [logs, timeWindow])

  const telemetry = useMemo(() => {
    const total = timeFilteredLogs.length
    const proCount = timeFilteredLogs.filter((l) => l.is_pro).length
    const freeCount = total - proCount
    const cacheHits = timeFilteredLogs.filter((l) => l.cache_hit).length
    const cacheHitPct = total > 0 ? Math.round((cacheHits / total) * 1000) / 10 : 0

    const latencyValues = timeFilteredLogs
      .map((l) => l.response_time_ms)
      .filter((ms): ms is number => typeof ms === 'number' && Number.isFinite(ms))

    const avgLatencyMs =
      latencyValues.length > 0
        ? Math.round(latencyValues.reduce((sum, n) => sum + n, 0) / latencyValues.length)
        : 0

    const p50LatencyMs = calculatePercentile(latencyValues, 50)
    const p95LatencyMs = calculatePercentile(latencyValues, 95)

    const byDay = new Map<string, DailyBucket>()
    for (const row of timeFilteredLogs) {
      const date = row.created_at.slice(0, 10)
      const existing = byDay.get(date) ?? { date, freeCount: 0, proCount: 0 }
      if (row.is_pro) {
        existing.proCount += 1
      } else {
        existing.freeCount += 1
      }
      byDay.set(date, existing)
    }
    const dailySeries = Array.from(byDay.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7)

    const providerStats: ProviderStat[] = ALL_PROVIDERS.map((provider) => {
      const matching = timeFilteredLogs.filter((l) => l.provider === provider)
      const latencies = matching
        .map((l) => l.response_time_ms)
        .filter((ms): ms is number => typeof ms === 'number' && Number.isFinite(ms))
      const providerAvgLatency =
        latencies.length > 0
          ? Math.round(latencies.reduce((sum, n) => sum + n, 0) / latencies.length)
          : 0
      const nonCachedCount = timeFilteredLogs.filter((l) => Boolean(l.provider)).length
      const sharePct =
        nonCachedCount > 0 ? Math.round((matching.length / nonCachedCount) * 100) : 0
      return {
        provider,
        calls: matching.length,
        avgLatencyMs: providerAvgLatency,
        sharePct
      }
    })

    return {
      total,
      proCount,
      freeCount,
      cacheHits,
      cacheHitPct,
      avgLatencyMs,
      p50LatencyMs,
      p95LatencyMs,
      dailySeries,
      providerStats
    }
  }, [timeFilteredLogs])

  // Live Query Feed Filtered Rows
  const feedRows = useMemo(() => {
    return timeFilteredLogs.filter((log) => {
      if (searchRepo && !log.repo_full_name.toLowerCase().includes(searchRepo.toLowerCase().trim())) {
        return false
      }
      if (filterProvider !== 'all') {
        if (filterProvider === 'cache' && !log.cache_hit) return false
        if (filterProvider !== 'cache' && log.provider !== filterProvider) return false
      }
      if (filterTier === 'free' && log.is_pro) return false
      if (filterTier === 'pro' && !log.is_pro) return false
      if (filterCache === 'hit' && !log.cache_hit) return false
      if (filterCache === 'miss' && log.cache_hit) return false
      return true
    })
  }, [timeFilteredLogs, searchRepo, filterProvider, filterTier, filterCache])

  function exportLogsToCsv() {
    if (feedRows.length === 0) return
    const headers = ['ID', 'Fecha', 'Repositorio', 'Tier', 'Cache Hit', 'Proveedor', 'Tipo', 'Latencia (ms)']
    const csvLines = [headers.join(',')]

    for (const r of feedRows) {
      csvLines.push(
        [
          `"${r.id}"`,
          `"${r.created_at}"`,
          `"${r.repo_full_name}"`,
          r.is_pro ? 'PRO' : 'FREE',
          r.cache_hit ? 'HIT' : 'MISS',
          `"${r.provider || (r.cache_hit ? 'cache' : 'none')}"`,
          r.action_type,
          r.response_time_ms ?? 0
        ].join(',')
      )
    }

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `telemetry_logs_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function moveProvider(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= priority.length) return
    setPriority((prev) => {
      const next = [...prev]
      const current = next[index]
      const swap = next[target]
      if (!current || !swap) return prev
      next[index] = swap
      next[target] = current
      return next
    })
  }

  function handleDrop(dropIndex: number) {
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null)
      return
    }
    setPriority((prev) => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      if (!moved) return prev
      next.splice(dropIndex, 0, moved)
      return next
    })
    setDragIndex(null)
  }

  async function handleSavePriority() {
    if (loadError) return
    setSaving(true)
    setStatus(null)
    const res = await dispatchServerConfigSync('provider_priority', priority, session.accessToken)
    setSaving(false)
    setStatus(
      res.success
        ? { type: 'success', message: `Cadena de proveedores sincronizada a KV: ${priority.join(' → ')}` }
        : { type: 'error', message: res.error ?? 'Fallo al sincronizar prioridad' }
    )
  }

  const maxDailyTotal = Math.max(
    1,
    ...telemetry.dailySeries.map((bucket) => bucket.freeCount + bucket.proCount)
  )

  return (
    <div className="space-y-6">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      {/* Live Stream Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3">
        <div className="flex items-center gap-3">
          {liveInterval > 0 ? (
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
              <span className="text-xs font-bold text-emerald-400 tracking-wide uppercase">
                En Vivo ({liveInterval / 1000}s)
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <Radio className="w-4 h-4 text-slate-500" />
              <span>Modo Manual</span>
            </div>
          )}
          <span className="text-slate-600">|</span>
          <span className="text-xs text-slate-400">
            Última actualización: <span className="text-slate-200 font-mono">{lastRefreshedAt.toLocaleTimeString()}</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Interval Selector */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <span className="text-[11px] text-slate-500 px-1.5">Auto:</span>
            {[
              { label: 'Off', val: 0 },
              { label: '5s', val: 5000 },
              { label: '10s', val: 10000 },
              { label: '30s', val: 30000 }
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setLiveInterval(opt.val)}
                className={`px-2 py-0.5 rounded font-medium transition ${
                  liveInterval === opt.val
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Time Window Selector */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <span className="text-[11px] text-slate-500 px-1.5">Rango:</span>
            {[
              { label: '1h', val: '1h' },
              { label: '24h', val: '24h' },
              { label: '7d', val: '7d' },
              { label: 'Todo', val: 'all' }
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setTimeWindow(opt.val as any)}
                className={`px-2 py-0.5 rounded font-medium transition ${
                  timeWindow === opt.val
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label={`Consultas Totales (${timeWindow})`}
          value={telemetry.total}
          hint={`${telemetry.freeCount} Free · ${telemetry.proCount} Pro`}
          accent="indigo"
          icon={<Activity className="w-4 h-4 text-indigo-400" />}
        />
        <KpiCard
          label="Tasa de Cache Hit en Vivo"
          value={`${telemetry.cacheHitPct}%`}
          hint={`${telemetry.cacheHits} llamadas a IA ahorradas`}
          accent={telemetry.cacheHitPct >= 75 ? 'emerald' : 'amber'}
          icon={<Zap className="w-4 h-4 text-emerald-400" />}
        />
        <KpiCard
          label="Latencia de Respuesta"
          value={`${telemetry.avgLatencyMs} ms`}
          hint={`P50: ${telemetry.p50LatencyMs}ms · P95: ${telemetry.p95LatencyMs}ms`}
          accent="sky"
          icon={<Gauge className="w-4 h-4 text-sky-400" />}
        />
        <KpiCard
          label="IA Primaria Activa"
          value={PROVIDER_LABELS[priority[0] ?? 'gemini'].label}
          hint={`Fallback: ${priority.slice(1).join(' → ')}`}
          accent="indigo"
          icon={<Cpu className="w-4 h-4 text-indigo-400" />}
        />
      </div>

      {/* Graphs Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title="Consultas Diarias (Free vs Pro)"
          description="Evolución de tráfico por día registrado en query_logs"
        >
          {telemetry.dailySeries.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">No hay telemetría registrada aún.</p>
          ) : (
            <div className="space-y-3">
              {telemetry.dailySeries.map((bucket) => {
                const total = bucket.freeCount + bucket.proCount
                const freeWidth = Math.round((bucket.freeCount / maxDailyTotal) * 100)
                const proWidth = Math.round((bucket.proCount / maxDailyTotal) * 100)
                return (
                  <div key={bucket.date} className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span className="font-mono">{bucket.date}</span>
                      <span>
                        <span className="text-sky-300">{bucket.freeCount} Free</span> ·{' '}
                        <span className="text-indigo-300">{bucket.proCount} Pro</span> ({total})
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden flex">
                      <div
                        className="bg-sky-500 h-full transition-all"
                        style={{ width: `${freeWidth}%` }}
                      />
                      <div
                        className="bg-indigo-500 h-full transition-all"
                        style={{ width: `${proWidth}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Distribución & Rendimiento de Proveedores IA"
          description="Volumen y latencia media por proveedor en la cadena"
        >
          <div className="space-y-3">
            {telemetry.providerStats.map((stat) => {
              const meta = PROVIDER_LABELS[stat.provider]
              return (
                <div
                  key={stat.provider}
                  className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-white">{meta.label}</div>
                      <div className="text-xs font-mono text-slate-400">{meta.model}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-white">
                        {stat.calls} llamadas ({stat.sharePct}%)
                      </div>
                      <div className="text-xs text-emerald-400">{stat.avgLatencyMs} ms avg</div>
                    </div>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${stat.sharePct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>
      </div>

      {/* Live Query Feed Table */}
      <SectionCard
        title="Live Query Feed — Registro de Consultas en Tiempo Real"
        description="Monitorea cada análisis entrante, proveedor seleccionado y respuesta de caché."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportLogsToCsv}
              disabled={feedRows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV ({feedRows.length})
            </button>
          </div>
        }
      >
        {/* Filter Controls Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pb-2 border-b border-slate-800">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por repo (ej. react)..."
              value={searchRepo}
              onChange={(e) => setSearchRepo(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <select
              value={filterProvider}
              onChange={(e) => setFilterProvider(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">Todos los Proveedores</option>
              <option value="cache">Solo Cache Hits</option>
              {ALL_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value as any)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">Todos los Planes</option>
              <option value="free">Solo Free</option>
              <option value="pro">Solo Pro</option>
            </select>
          </div>

          <div>
            <select
              value={filterCache}
              onChange={(e) => setFilterCache(e.target.value as any)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">Todos los Estados</option>
              <option value="hit">Solo Cache Hit</option>
              <option value="miss">Solo AI Generation (Miss)</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        {feedRows.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">
            No se encontraron consultas coincidentes con los filtros actuales.
          </p>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Tiempo</th>
                  <th className="py-2.5 px-3">Repositorio</th>
                  <th className="py-2.5 px-3">Plan</th>
                  <th className="py-2.5 px-3">Caché</th>
                  <th className="py-2.5 px-3">Proveedor</th>
                  <th className="py-2.5 px-3 text-right">Latencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {feedRows.slice(0, 50).map((row) => {
                  const ms = row.response_time_ms ?? 0
                  const latencyColor =
                    ms < 500
                      ? 'text-emerald-400 bg-emerald-500/10'
                      : ms < 1500
                        ? 'text-sky-400 bg-sky-500/10'
                        : 'text-amber-400 bg-amber-500/10'

                  return (
                    <tr key={row.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-2 px-3 text-slate-400 whitespace-nowrap text-[11px]">
                        {formatRelativeTime(row.created_at)}
                      </td>
                      <td className="py-2 px-3 text-white font-medium truncate max-w-xs">
                        {row.repo_full_name}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            row.is_pro
                              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {row.is_pro ? 'PRO' : 'FREE'}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            row.cache_hit
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-amber-500/15 text-amber-300'
                          }`}
                        >
                          {row.cache_hit ? 'HIT' : 'MISS'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-300">
                        {row.cache_hit
                          ? 'KV Cache'
                          : row.provider
                            ? (PROVIDER_LABELS[row.provider as ProviderName]?.label ?? row.provider)
                            : 'Direct'}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${latencyColor}`}>
                          {ms} ms
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Provider Priority Chain */}
      <SectionCard
        title="Cadena de Prioridad de Proveedores IA"
        description="Arrastra y suelta para reordenar la secuencia de fallback de IA guardada en Cloudflare KV (provider_priority)"
        actions={
          <button
            type="button"
            onClick={() => void handleSavePriority()}
            disabled={loading || saving || loadError !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Sincronizando...' : 'Guardar Prioridad'}
          </button>
        }
      >
        <div className="space-y-2">
          {priority.map((provider, index) => {
            const meta = PROVIDER_LABELS[provider]
            return (
              <div
                key={provider}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(index)}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 cursor-grab active:cursor-grabbing hover:border-slate-700 transition"
              >
                <div className="flex items-center gap-3">
                  <GripVertical className="w-4 h-4 text-slate-500" />
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-300">
                    {index + 1}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-white">{meta.label}</div>
                    <div className="text-xs font-mono text-slate-400">{provider} · {meta.model}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveProvider(index, -1)}
                    disabled={index === 0}
                    className="rounded border border-slate-700 bg-slate-800 p-1 text-slate-300 hover:text-white disabled:opacity-30"
                    aria-label={`Subir ${provider}`}
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveProvider(index, 1)}
                    disabled={index === priority.length - 1}
                    className="rounded border border-slate-700 bg-slate-800 p-1 text-slate-300 hover:text-white disabled:opacity-30"
                    aria-label={`Bajar ${provider}`}
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </SectionCard>
    </div>
  )
}

export default function AdminDashboardPage() {
  return (
    <AdminShell
      activeRoute="/"
      title="Telemetría en Vivo & Proveedores IA"
      subtitle="Monitorea uso en tiempo real, latencia P50/P95, tasa de Cache Hit y balanceo entre proveedores de IA."
    >
      {({ client, session }) => <DashboardContent client={client} session={session} />}
    </AdminShell>
  )
}
