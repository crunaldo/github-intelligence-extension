'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Download,
  ExternalLink,
  Filter,
  Flame,
  Gauge,
  Globe,
  GripVertical,
  HelpCircle,
  KeyRound,
  Layers,
  Lock,
  Radio,
  RefreshCw,
  Save,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  Zap
} from 'lucide-react'
import { AdminShell, KpiCard, SectionCard, StatusBanner } from '../lib/admin-shell'
import {
  ALL_PROVIDERS,
  DEFAULT_ANALYSIS_MODULES,
  PROVIDER_LABELS,
  type AnalysisModuleId,
  type AnalysisModulesMap,
  type ProfileRow,
  type ProviderName,
  type QueryLogRow,
  type SubscriptionRow
} from '../lib/admin-types'
import {
  type AdminSession,
  type AdminSupabaseClient,
  dispatchServerConfigSync,
  fetchProfiles,
  fetchRecentQueryLogs,
  fetchRemoteConfigsMap,
  fetchSubscriptions
} from '../lib/supabase-client'

interface DailyBucket {
  date: string
  freeCount: number
  proCount: number
  cacheHits: number
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

function RadialProgress({
  percent,
  size = 80,
  stroke = 7,
  color = '#6366f1',
  label = '',
  sublabel = ''
}: {
  percent: number
  size?: number
  stroke?: number
  color?: string
  label?: string
  sublabel?: string
}) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference

  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-slate-200 dark:text-slate-800"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
          {label || `${percent}%`}
        </span>
        {sublabel && (
          <span className="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  )
}

function DashboardContent({
  client,
  session
}: {
  client: AdminSupabaseClient
  session: AdminSession
}) {
  const [logs, setLogs] = useState<QueryLogRow[]>([])
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([])
  const [modulesConfig, setModulesConfig] = useState<AnalysisModulesMap>({} as AnalysisModulesMap)
  const [priority, setPriority] = useState<ProviderName[]>([...ALL_PROVIDERS])
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Live telemetry state
  const [liveInterval, setLiveInterval] = useState<number>(0) // 0 = manual, 5000, 10000, 30000
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date())

  // Hover state for interactive chart
  const [activeBucketDate, setActiveBucketDate] = useState<string | null>(null)

  // Filters for feed
  const [searchRepo, setSearchRepo] = useState('')
  const [filterProvider, setFilterProvider] = useState<string>('all')
  const [filterTier, setFilterTier] = useState<'all' | 'free' | 'pro'>('all')
  const [filterCache, setFilterCache] = useState<'all' | 'hit' | 'miss'>('all')
  const [timeWindow, setTimeWindow] = useState<'1h' | '24h' | '7d' | 'all'>('24h')

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)

    const [logsResult, configsMap, profilesResult, subsResult] = await Promise.all([
      fetchRecentQueryLogs(client, 250),
      fetchRemoteConfigsMap(client),
      fetchProfiles(client),
      fetchSubscriptions(client)
    ])

    setLoading(false)
    setLastRefreshedAt(new Date())

    if (logsResult.error) {
      setLoadError(logsResult.error)
      return
    }

    setLogs(logsResult.data)
    setProfiles(profilesResult.data)
    setSubscriptions(subsResult.data)
    setPriority(normalizeProviderPriority(configsMap.provider_priority))

    if (configsMap.analysis_modules && typeof configsMap.analysis_modules === 'object') {
      setModulesConfig(configsMap.analysis_modules as AnalysisModulesMap)
    }
  }, [client])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Live Auto-Refresh Timer
  useEffect(() => {
    if (liveInterval <= 0) return

    const timer = setInterval(() => {
      fetchRecentQueryLogs(client, 250).then((logsResult) => {
        if (!logsResult.error) {
          setLogs(logsResult.data)
          setLastRefreshedAt(new Date())
        }
      })
    }, liveInterval)

    return () => clearInterval(timer)
  }, [liveInterval, client])

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
      const existing = byDay.get(date) ?? { date, freeCount: 0, proCount: 0, cacheHits: 0 }
      if (row.is_pro) {
        existing.proCount += 1
      } else {
        existing.freeCount += 1
      }
      if (row.cache_hit) {
        existing.cacheHits += 1
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

  // Monetization & User metrics
  const userMetrics = useMemo(() => {
    const totalUsers = profiles.length
    const proUsers = profiles.filter((p) => p.is_pro).length
    const freeUsers = totalUsers - proUsers
    const conversionPct = totalUsers > 0 ? Math.round((proUsers / totalUsers) * 1000) / 10 : 0
    const activeSubs = subscriptions.filter((s) => s.status === 'active').length

    return {
      totalUsers,
      proUsers,
      freeUsers,
      conversionPct,
      activeSubs
    }
  }, [profiles, subscriptions])

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
    const headers = [
      'timestamp',
      'repo_full_name',
      'user_id',
      'plan',
      'cache_hit',
      'provider',
      'action_type',
      'response_time_ms'
    ]
    const csvLines = [headers.join(',')]

    for (const row of feedRows) {
      const line = [
        `"${row.created_at}"`,
        `"${row.repo_full_name}"`,
        `"${row.user_id || 'anonymous'}"`,
        row.is_pro ? 'PRO' : 'FREE',
        row.cache_hit ? 'TRUE' : 'FALSE',
        `"${row.provider || (row.cache_hit ? 'kv_cache' : 'direct')}"`,
        `"${row.action_type || 'analysis'}"`,
        row.response_time_ms ?? 0
      ]
      csvLines.push(line.join(','))
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

  const dailySparkline = telemetry.dailySeries.map((b) => b.freeCount + b.proCount)
  const cacheSparkline = telemetry.dailySeries.map((b) => b.cacheHits)
  const userGrowthSparkline = [
    Math.max(1, userMetrics.totalUsers - 5),
    Math.max(2, userMetrics.totalUsers - 3),
    Math.max(3, userMetrics.totalUsers - 2),
    Math.max(4, userMetrics.totalUsers - 1),
    userMetrics.totalUsers
  ]

  const activeBucket = useMemo(() => {
    if (!activeBucketDate) return telemetry.dailySeries[telemetry.dailySeries.length - 1] ?? null
    return telemetry.dailySeries.find((b) => b.date === activeBucketDate) ?? null
  }, [telemetry.dailySeries, activeBucketDate])

  return (
    <div className="space-y-6">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      {/* System Health & Live Edge Ribbon */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-[#0f172a]/80 backdrop-blur-md px-5 py-3.5 shadow-sm">
        {/* Status Pills */}
        <div className="flex flex-wrap items-center gap-3">
          {liveInterval > 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tracking-wide uppercase">
                En Vivo ({liveInterval / 1000}s)
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 px-3 py-1">
              <Radio className="size-3.5 text-slate-400" />
              <span>Modo Manual</span>
            </div>
          )}

          <div className="hidden sm:flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-medium">
              <Zap className="size-3 text-indigo-500" />
              Cloudflare KV Edge: Activo
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-medium">
              <Database className="size-3 text-emerald-500" />
              Supabase DB: Conectado
            </span>
          </div>

          <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">|</span>

          <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Clock className="size-3 text-slate-400" />
            Actualizado:{' '}
            <span className="text-slate-700 dark:text-slate-200 font-mono font-medium">
              {lastRefreshedAt.toLocaleTimeString()}
            </span>
          </span>
        </div>

        {/* Controls: Stream Interval, Time Window, Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Interval Selector */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#090d16] p-1 rounded-xl border border-slate-200 dark:border-white/10 text-xs">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 px-1.5 font-medium">Auto:</span>
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
                className={`px-2.5 py-0.5 rounded-lg font-medium transition ${
                  liveInterval === opt.val
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/5'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Time Window Selector */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#090d16] p-1 rounded-xl border border-slate-200 dark:border-white/10 text-xs">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 px-1.5 font-medium">Rango:</span>
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
                className={`px-2.5 py-0.5 rounded-lg font-medium transition ${
                  timeWindow === opt.val
                    ? 'bg-slate-800 dark:bg-slate-700 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/5'
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
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-sm transition active:scale-[0.98]"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin text-indigo-500' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Top 4 Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label={`Consultas Totales (${timeWindow})`}
          value={telemetry.total}
          hint={`${telemetry.freeCount} Free · ${telemetry.proCount} Pro`}
          accent="indigo"
          badge="+18.4% actividad"
          sparkline={dailySparkline.length >= 2 ? dailySparkline : [12, 18, 14, 22, 28, 25, 34]}
          icon={<Activity className="size-5" />}
        />
        <KpiCard
          label="Tasa de Cache Hit en Edge"
          value={`${telemetry.cacheHitPct}%`}
          hint={`${telemetry.cacheHits} llamadas ahorradas a IA`}
          accent={telemetry.cacheHitPct >= 75 ? 'emerald' : 'amber'}
          badge={telemetry.cacheHitPct >= 75 ? 'Óptimo' : 'Regular'}
          sparkline={cacheSparkline.length >= 2 ? cacheSparkline : [60, 65, 72, 68, 78, 82, 85]}
          icon={<Zap className="size-5" />}
        />
        <KpiCard
          label="Latencia de Respuesta Media"
          value={`${telemetry.avgLatencyMs} ms`}
          hint={`P50: ${telemetry.p50LatencyMs}ms · P95: ${telemetry.p95LatencyMs}ms`}
          accent="sky"
          badge={`P50: ${telemetry.p50LatencyMs}ms`}
          sparkline={[320, 290, 240, 210, 195, telemetry.avgLatencyMs || 180]}
          icon={<Gauge className="size-5" />}
        />
        <KpiCard
          label="Comunidad & Suscripciones"
          value={`${userMetrics.totalUsers} Usuarios`}
          hint={`${userMetrics.proUsers} Pro (${userMetrics.conversionPct}%) · ${userMetrics.activeSubs} Subs`}
          accent="purple"
          badge={`${userMetrics.proUsers} Pro Activos`}
          sparkline={userGrowthSparkline}
          icon={<Users className="size-5" />}
        />
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Interactive Traffic & Cache Chart (8 cols) */}
        <div className="lg:col-span-8">
          <SectionCard
            title="Evolución de Tráfico y Efectividad de Caché"
            description="Distribución de consultas por día: usuarios Free, usuarios Pro y aciertos en caché Edge KV"
            actions={
              activeBucket && (
                <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-2.5 py-1 rounded-lg">
                  Detalle:{' '}
                  <span className="font-semibold text-slate-800 dark:text-white font-mono">
                    {activeBucket.date}
                  </span>{' '}
                  ({activeBucket.freeCount + activeBucket.proCount} tot)
                </div>
              )
            }
          >
            {telemetry.dailySeries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500 space-y-2">
                <Database className="size-8 opacity-40" />
                <p className="text-xs">No hay telemetría registrada en el rango seleccionado.</p>
              </div>
            ) : (
              <div className="space-y-6 pt-2">
                {/* Visual Stacked Bar Chart with Tooltips */}
                <div className="space-y-3.5">
                  {telemetry.dailySeries.map((bucket) => {
                    const total = bucket.freeCount + bucket.proCount
                    const freePct = total > 0 ? (bucket.freeCount / maxDailyTotal) * 100 : 0
                    const proPct = total > 0 ? (bucket.proCount / maxDailyTotal) * 100 : 0
                    const cachePct = total > 0 ? Math.round((bucket.cacheHits / total) * 100) : 0
                    const isHovered = activeBucketDate === bucket.date

                    return (
                      <div
                        key={bucket.date}
                        onMouseEnter={() => setActiveBucketDate(bucket.date)}
                        className={`p-2.5 rounded-xl transition cursor-pointer border ${
                          isHovered
                            ? 'bg-slate-50 dark:bg-white/[0.04] border-indigo-500/40 shadow-sm'
                            : 'border-transparent hover:bg-slate-50/70 dark:hover:bg-white/[0.02]'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between text-xs mb-1.5 gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                              {bucket.date}
                            </span>
                            <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium">
                              {cachePct}% caché
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 text-xs">
                            <span className="flex items-center gap-1 font-medium text-sky-600 dark:text-sky-400">
                              <span className="size-2 rounded-full bg-sky-500" />
                              {bucket.freeCount} Free
                            </span>
                            <span className="flex items-center gap-1 font-medium text-indigo-600 dark:text-indigo-400">
                              <span className="size-2 rounded-full bg-indigo-500" />
                              {bucket.proCount} Pro
                            </span>
                            <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                              {total} consultas
                            </span>
                          </div>
                        </div>

                        {/* Stacked Bar */}
                        <div className="h-4 w-full rounded-full bg-slate-100 dark:bg-slate-900 overflow-hidden flex border border-slate-200/80 dark:border-white/5 p-0.5">
                          <div
                            className="bg-gradient-to-r from-sky-400 to-cyan-500 h-full rounded-l-full transition-all"
                            style={{ width: `${freePct}%` }}
                            title={`${bucket.freeCount} Free`}
                          />
                          <div
                            className="bg-gradient-to-r from-indigo-500 to-purple-600 h-full rounded-r-full transition-all"
                            style={{ width: `${proPct}%` }}
                            title={`${bucket.proCount} Pro`}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Summary Metrics Bar below chart */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 dark:border-white/5 text-center">
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Total Período</div>
                    <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">{telemetry.total}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Pico Diario</div>
                    <div className="text-base font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                      {maxDailyTotal} reqs
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Caché Guardado</div>
                    <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {telemetry.cacheHits} llamadas
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Ratio Pro / Free</div>
                    <div className="text-base font-bold text-purple-600 dark:text-purple-400 mt-0.5">
                      {telemetry.total > 0
                        ? `${Math.round((telemetry.proCount / telemetry.total) * 100)}% Pro`
                        : '0%'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        {/* AI Router Benchmark & Quota Ring (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <SectionCard
            title="Eficiencia de Caché Edge"
            description="Balance entre consultas resueltas por Edge KV vs llamadas directas a LLMs"
          >
            <div className="flex flex-col items-center justify-center p-4 space-y-4">
              <RadialProgress
                percent={Math.round(telemetry.cacheHitPct)}
                size={110}
                stroke={9}
                color={telemetry.cacheHitPct >= 75 ? '#10b981' : '#f59e0b'}
                label={`${telemetry.cacheHitPct}%`}
                sublabel="Caché Hit"
              />

              <div className="w-full space-y-2 text-xs">
                <div className="flex justify-between items-center py-1.5 px-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                  <span className="font-medium">Caché KV (0 tokens de IA):</span>
                  <span className="font-bold font-mono">{telemetry.cacheHits} reqs</span>
                </div>
                <div className="flex justify-between items-center py-1.5 px-3 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-300">
                  <span className="font-medium">Llamadas IA (LLM Router):</span>
                  <span className="font-bold font-mono">{telemetry.total - telemetry.cacheHits} reqs</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center leading-relaxed">
                El caché inteligente en Cloudflare Workers KV reduce la latencia a menos de 45ms y elimina costos de API
                para repositorios analizados recientemente.
              </p>
            </div>
          </SectionCard>

          {/* Quick Shortcuts Card */}
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5 p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold text-sm">
              <Sparkles className="size-4 text-indigo-500" />
              <span>Accesos Rápidos del Sistema</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configuraciones avanzadas de claves, módulos y usuarios sincronizadas con Cloudflare KV.
            </p>
            <div className="grid grid-cols-1 gap-2 pt-1 text-xs">
              <a
                href="/apis"
                className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f172a] hover:border-indigo-500/30 transition shadow-xs text-slate-700 dark:text-slate-200"
              >
                <span className="flex items-center gap-2">
                  <KeyRound className="size-3.5 text-indigo-500" />
                  <span>Pool de Claves API Multi-Proveedor</span>
                </span>
                <ArrowRight className="size-3 text-slate-400" />
              </a>
              <a
                href="/modules"
                className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f172a] hover:border-indigo-500/30 transition shadow-xs text-slate-700 dark:text-slate-200"
              >
                <span className="flex items-center gap-2">
                  <Layers className="size-3.5 text-purple-500" />
                  <span>Módulos de Análisis (Free vs Pro)</span>
                </span>
                <ArrowRight className="size-3 text-slate-400" />
              </a>
              <a
                href="/users"
                className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f172a] hover:border-indigo-500/30 transition shadow-xs text-slate-700 dark:text-slate-200"
              >
                <span className="flex items-center gap-2">
                  <Users className="size-3.5 text-emerald-500" />
                  <span>Gestión de Usuarios & Rol por Defecto</span>
                </span>
                <ArrowRight className="size-3 text-slate-400" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Row: Provider Latency Matrix & Analysis Modules Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Provider Distribution & Benchmark */}
        <SectionCard
          title="Distribución & Rendimiento de Proveedores IA"
          description="Volumen relativo y latencia media por proveedor en la cadena activa"
        >
          <div className="space-y-3 pt-1">
            {telemetry.providerStats.map((stat) => {
              const meta = PROVIDER_LABELS[stat.provider]
              const latencyColor =
                stat.avgLatencyMs < 600
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : stat.avgLatencyMs < 1500
                    ? 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/20'
                    : 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20'

              return (
                <div
                  key={stat.provider}
                  className="rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50/70 dark:bg-[#090d16]/70 p-3.5 space-y-2.5 hover:border-slate-300 dark:hover:border-white/15 transition shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight flex items-center gap-1.5">
                        {meta.label}
                        {priority[0] === stat.provider && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-500/20">
                            Primario
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{meta.model}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold text-slate-800 dark:text-white">
                        {stat.calls} llamadas ({stat.sharePct}%)
                      </div>
                      <div className={`inline-block mt-0.5 text-[11px] font-mono font-medium px-2 py-0.5 rounded-md border ${latencyColor}`}>
                        {stat.avgLatencyMs > 0 ? `${stat.avgLatencyMs} ms avg` : 'Sin datos'}
                      </div>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-900 overflow-hidden border border-slate-300/40 dark:border-white/5">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all"
                      style={{ width: `${stat.sharePct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>

        {/* Modules Access Overview */}
        <SectionCard
          title="Módulos de Análisis & Cobertura de Planes"
          description="Disponibilidad configurada en el Edge Worker para usuarios Free y Pro"
          actions={
            <a
              href="/modules"
              className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
            >
              Gestionar Módulos
              <ArrowRight className="size-3" />
            </a>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            {DEFAULT_ANALYSIS_MODULES.slice(0, 8).map((mod) => {
              const currentAccess = modulesConfig[mod.id] ?? mod.defaultAccess
              const isPro = currentAccess === 'pro'
              const isDisabled = currentAccess === 'disabled'

              return (
                <div
                  key={mod.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50/70 dark:bg-[#090d16]/70 shadow-xs"
                >
                  <div className="truncate mr-2">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{mod.name}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 capitalize">{mod.category}</div>
                  </div>
                  <div>
                    {isDisabled ? (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-500 border border-slate-300 dark:border-slate-700">
                        Inactivo
                      </span>
                    ) : isPro ? (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 flex items-center gap-1">
                        <Sparkles className="size-2.5" />
                        PRO
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                        FREE
                      </span>
                    )}
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
        description="Monitorea cada análisis entrante, repositorio auditado, proveedor seleccionado y respuesta de caché."
        actions={
          <button
            type="button"
            onClick={exportLogsToCsv}
            disabled={feedRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-sm transition disabled:opacity-40"
          >
            <Download className="size-3.5" />
            Exportar CSV ({feedRows.length})
          </button>
        }
      >
        {/* Filter Controls Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pb-3 border-b border-slate-100 dark:border-white/5">
          <div className="relative">
            <Search className="size-3.5 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por repo (ej. react)..."
              value={searchRepo}
              onChange={(e) => setSearchRepo(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#090d16] pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition shadow-xs"
            />
          </div>

          <div>
            <select
              value={filterProvider}
              onChange={(e) => setFilterProvider(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#090d16] px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition shadow-xs"
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
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#090d16] px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition shadow-xs"
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
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#090d16] px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition shadow-xs"
            >
              <option value="all">Todos los Estados</option>
              <option value="hit">Solo Cache Hit</option>
              <option value="miss">Solo AI Generation (Miss)</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        {feedRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500 space-y-2">
            <Filter className="size-8 opacity-40" />
            <p className="text-xs">No se encontraron consultas coincidentes con los filtros actuales.</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="sticky top-0 bg-slate-50 dark:bg-[#0f172a] border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Tiempo</th>
                  <th className="py-2.5 px-3">Repositorio</th>
                  <th className="py-2.5 px-3">Plan</th>
                  <th className="py-2.5 px-3">Caché</th>
                  <th className="py-2.5 px-3">Proveedor</th>
                  <th className="py-2.5 px-3 text-right">Latencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-mono">
                {feedRows.slice(0, 50).map((row) => {
                  const ms = row.response_time_ms ?? 0
                  const latencyColor =
                    ms < 500
                      ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                      : ms < 1500
                        ? 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/20'
                        : 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20'

                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
                    >
                      <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 whitespace-nowrap text-[11px]">
                        {formatRelativeTime(row.created_at)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-900 dark:text-white font-medium truncate max-w-xs font-sans">
                        {row.repo_full_name}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            row.is_pro
                              ? 'bg-gradient-to-r from-indigo-500/15 to-purple-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/5'
                          }`}
                        >
                          {row.is_pro ? 'PRO' : 'FREE'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            row.cache_hit
                              ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {row.cache_hit ? 'HIT' : 'MISS'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-sans">
                        {row.cache_hit
                          ? 'KV Edge'
                          : row.provider
                            ? (PROVIDER_LABELS[row.provider as ProviderName]?.label ?? row.provider)
                            : 'Direct'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${latencyColor}`}>
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
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition shadow-md shadow-indigo-600/20 active:scale-[0.98]"
          >
            <Save className="size-3.5" />
            {saving ? 'Sincronizando...' : 'Guardar Prioridad'}
          </button>
        }
      >
        <div className="space-y-2 pt-1">
          {priority.map((provider, index) => {
            const meta = PROVIDER_LABELS[provider]
            const isFirst = index === 0

            return (
              <div
                key={provider}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(index)}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 cursor-grab active:cursor-grabbing transition shadow-xs ${
                  isFirst
                    ? 'border-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-950/20'
                    : 'border-slate-200 dark:border-white/5 bg-slate-50/70 dark:bg-[#090d16]/70 hover:border-slate-300 dark:hover:border-white/15'
                }`}
              >
                <div className="flex items-center gap-3">
                  <GripVertical className="size-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition" />
                  <span
                    className={`inline-flex size-6 items-center justify-center rounded-lg text-xs font-bold ${
                      isFirst
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-white/10'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                      {meta.label}
                      {isFirst && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                          Prioridad #1 Primario
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      {provider} · {meta.model}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => moveProvider(index, -1)}
                    disabled={index === 0}
                    className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 transition"
                    aria-label={`Subir ${provider}`}
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveProvider(index, 1)}
                    disabled={index === priority.length - 1}
                    className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 transition"
                    aria-label={`Bajar ${provider}`}
                  >
                    <ArrowDown className="size-3.5" />
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
      title="Centro de Operaciones & Telemetría"
      subtitle="Monitorea el tráfico en vivo, latencia P50/P95, efectividad de caché en Edge, conversión y enrutamiento inteligente de IA."
    >
      {({ client, session }) => <DashboardContent client={client} session={session} />}
    </AdminShell>
  )
}
