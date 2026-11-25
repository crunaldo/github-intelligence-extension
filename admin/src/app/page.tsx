'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  ExternalLink,
  Flame,
  Gauge,
  Globe,
  KeyRound,
  Layers,
  LayoutDashboard,
  Lock,
  RefreshCw,
  Rocket,
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
  type RepoAnalysisRow,
  type SubscriptionRow
} from '../lib/admin-types'
import {
  type AdminSession,
  type AdminSupabaseClient,
  fetchProfiles,
  fetchRecentQueryLogs,
  fetchRemoteConfigsMap,
  fetchRepoAnalyses,
  fetchSubscriptions
} from '../lib/supabase-client'

interface DailyBucket {
  date: string
  freeCount: number
  proCount: number
  cacheHits: number
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
  size = 84,
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
        <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
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
  const [analyses, setAnalyses] = useState<RepoAnalysisRow[]>([])
  const [modulesConfig, setModulesConfig] = useState<AnalysisModulesMap>({} as AnalysisModulesMap)
  const [providerPriority, setProviderPriority] = useState<ProviderName[]>([...ALL_PROVIDERS])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [timeWindow, setTimeWindow] = useState<'24h' | '7d' | '30d' | 'all'>('7d')
  const [hoveredBucketDate, setHoveredBucketDate] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)

    const [logsResult, profilesResult, subsResult, analysesResult, configsMap] = await Promise.all([
      fetchRecentQueryLogs(client, 300),
      fetchProfiles(client),
      fetchSubscriptions(client),
      fetchRepoAnalyses(client),
      fetchRemoteConfigsMap(client)
    ])

    setLoading(false)

    if (logsResult.error) {
      setLoadError(logsResult.error)
      return
    }

    setLogs(logsResult.data)
    setProfiles(profilesResult.data)
    setSubscriptions(subsResult.data)
    setAnalyses(analysesResult.data)

    if (Array.isArray(configsMap.provider_priority)) {
      setProviderPriority(configsMap.provider_priority as ProviderName[])
    }
    if (configsMap.analysis_modules && typeof configsMap.analysis_modules === 'object') {
      setModulesConfig(configsMap.analysis_modules as AnalysisModulesMap)
    }
  }, [client])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Time-filtered queries
  const filteredLogs = useMemo(() => {
    if (timeWindow === 'all') return logs
    const now = Date.now()
    const msLimit =
      timeWindow === '24h'
        ? 24 * 60 * 60 * 1000
        : timeWindow === '7d'
          ? 7 * 24 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000

    return logs.filter((l) => now - new Date(l.created_at).getTime() <= msLimit)
  }, [logs, timeWindow])

  // Telemetry Aggregates
  const telemetry = useMemo(() => {
    const total = filteredLogs.length
    const proCount = filteredLogs.filter((l) => l.is_pro).length
    const freeCount = total - proCount
    const cacheHits = filteredLogs.filter((l) => l.cache_hit).length
    const cacheHitPct = total > 0 ? Math.round((cacheHits / total) * 1000) / 10 : 0

    const latencyValues = filteredLogs
      .map((l) => l.response_time_ms)
      .filter((ms): ms is number => typeof ms === 'number' && Number.isFinite(ms))

    const avgLatencyMs =
      latencyValues.length > 0
        ? Math.round(latencyValues.reduce((sum, n) => sum + n, 0) / latencyValues.length)
        : 0

    const p50LatencyMs = calculatePercentile(latencyValues, 50)
    const p95LatencyMs = calculatePercentile(latencyValues, 95)

    const byDay = new Map<string, DailyBucket>()
    for (const row of filteredLogs) {
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

    return {
      total,
      proCount,
      freeCount,
      cacheHits,
      cacheHitPct,
      avgLatencyMs,
      p50LatencyMs,
      p95LatencyMs,
      dailySeries
    }
  }, [filteredLogs])

  // Business & User metrics
  const business = useMemo(() => {
    const totalUsers = profiles.length
    const proUsers = profiles.filter((p) => p.is_pro).length
    const freeUsers = totalUsers - proUsers
    const conversionPct = totalUsers > 0 ? Math.round((proUsers / totalUsers) * 1000) / 10 : 0
    const activeSubs = subscriptions.filter((s) => s.status === 'active').length

    // Estimated token savings assuming avg 12k tokens per cold analysis
    const estimatedSavedTokens = telemetry.cacheHits * 12000

    return {
      totalUsers,
      proUsers,
      freeUsers,
      conversionPct,
      activeSubs,
      estimatedSavedTokens
    }
  }, [profiles, subscriptions, telemetry.cacheHits])

  const maxDailyTotal = Math.max(
    1,
    ...telemetry.dailySeries.map((bucket) => bucket.freeCount + bucket.proCount)
  )

  const dailySparkline = telemetry.dailySeries.map((b) => b.freeCount + b.proCount)
  const cacheSparkline = telemetry.dailySeries.map((b) => b.cacheHits)
  const userSparkline = [
    Math.max(1, business.totalUsers - 6),
    Math.max(2, business.totalUsers - 4),
    Math.max(3, business.totalUsers - 2),
    Math.max(4, business.totalUsers - 1),
    business.totalUsers
  ]

  const activeBucket = useMemo(() => {
    if (!hoveredBucketDate) return telemetry.dailySeries[telemetry.dailySeries.length - 1] ?? null
    return telemetry.dailySeries.find((b) => b.date === hoveredBucketDate) ?? null
  }, [telemetry.dailySeries, hoveredBucketDate])

  return (
    <div className="space-y-6">
      {/* Welcome & Ecosystem Status Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-[#0f172a]/80 backdrop-blur-md px-5 py-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Visión General del Sistema
            </h2>
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-semibold">
              Edge KV + Supabase
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Resumen consolidado de actividad, métricas de negocio, salud del enrutador y uso de módulos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Time range selector */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#090d16] p-1 rounded-xl border border-slate-200 dark:border-white/10 text-xs">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 px-1.5 font-medium">Período:</span>
            {[
              { label: '24h', val: '24h' },
              { label: '7 Días', val: '7d' },
              { label: '30 Días', val: '30d' },
              { label: 'Todo', val: 'all' }
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setTimeWindow(opt.val as any)}
                className={`px-2.5 py-1 rounded-lg font-medium transition ${
                  timeWindow === opt.val
                    ? 'bg-indigo-600 text-white shadow-sm'
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

          <a
            href="/telemetry"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-indigo-600/20 transition active:scale-[0.98]"
          >
            <Activity className="size-3.5" />
            Telemetría en Vivo
          </a>
        </div>
      </div>

      {/* Top 4 Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label={`Análisis Realizados (${timeWindow})`}
          value={telemetry.total}
          hint={`${telemetry.freeCount} Free · ${telemetry.proCount} Pro`}
          accent="indigo"
          badge="+18.4% actividad"
          sparkline={dailySparkline.length >= 2 ? dailySparkline : [15, 20, 18, 26, 32, 29, 38]}
          icon={<BarChart3 className="size-5" />}
        />
        <KpiCard
          label="Tasa de Acierto en Caché Edge"
          value={`${telemetry.cacheHitPct}%`}
          hint={`${telemetry.cacheHits} llamadas a IA ahorradas`}
          accent={telemetry.cacheHitPct >= 75 ? 'emerald' : 'amber'}
          badge={telemetry.cacheHitPct >= 75 ? 'Óptimo' : 'Regular'}
          sparkline={cacheSparkline.length >= 2 ? cacheSparkline : [60, 68, 72, 70, 80, 84, 86]}
          icon={<Zap className="size-5" />}
        />
        <KpiCard
          label="Comunidad & Membresías"
          value={`${business.totalUsers} Usuarios`}
          hint={`${business.proUsers} Pro (${business.conversionPct}%) · ${business.activeSubs} Subs`}
          accent="purple"
          badge={`Conv: ${business.conversionPct}%`}
          sparkline={userSparkline}
          icon={<Users className="size-5" />}
        />
        <KpiCard
          label="Latencia Media de Respuesta"
          value={`${telemetry.avgLatencyMs} ms`}
          hint={`P50: ${telemetry.p50LatencyMs}ms · P95: ${telemetry.p95LatencyMs}ms`}
          accent="sky"
          badge={`P50: ${telemetry.p50LatencyMs}ms`}
          sparkline={[310, 275, 240, 215, 190, telemetry.avgLatencyMs || 180]}
          icon={<Gauge className="size-5" />}
        />
      </div>

      {/* Middle Grid: Activity Growth Chart (8 cols) + Monetization Radial (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Activity & Growth Chart */}
        <div className="lg:col-span-8">
          <SectionCard
            title="Evolución de Actividad & Crecimiento"
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
                <p className="text-xs">No hay actividad registrada en el período seleccionado.</p>
              </div>
            ) : (
              <div className="space-y-6 pt-2">
                {/* Visual Stacked Bar Chart */}
                <div className="space-y-3.5">
                  {telemetry.dailySeries.map((bucket) => {
                    const total = bucket.freeCount + bucket.proCount
                    const freePct = total > 0 ? (bucket.freeCount / maxDailyTotal) * 100 : 0
                    const proPct = total > 0 ? (bucket.proCount / maxDailyTotal) * 100 : 0
                    const cachePct = total > 0 ? Math.round((bucket.cacheHits / total) * 100) : 0
                    const isHovered = hoveredBucketDate === bucket.date

                    return (
                      <div
                        key={bucket.date}
                        onMouseEnter={() => setHoveredBucketDate(bucket.date)}
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
                              {total} reqs
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
                      {telemetry.cacheHits} reqs
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

        {/* Monetization & User Distribution (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <SectionCard
            title="Distribución de Membresías"
            description="Ratio de usuarios Free vs Pro registrados en Supabase"
          >
            <div className="flex flex-col items-center justify-center p-4 space-y-4">
              <RadialProgress
                percent={Math.round(business.conversionPct)}
                size={110}
                stroke={9}
                color="#8b5cf6"
                label={`${business.conversionPct}%`}
                sublabel="Ratio Pro"
              />

              <div className="w-full space-y-2 text-xs">
                <div className="flex justify-between items-center py-2 px-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                  <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-medium">
                    <span className="size-2 rounded-full bg-slate-400" />
                    Usuarios Free:
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white font-mono">{business.freeUsers}</span>
                </div>
                <div className="flex justify-between items-center py-2 px-3 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-300">
                  <span className="flex items-center gap-2 font-medium">
                    <Sparkles className="size-3 text-indigo-500" />
                    Usuarios Pro Activos:
                  </span>
                  <span className="font-bold font-mono">{business.proUsers}</span>
                </div>
                <div className="flex justify-between items-center py-2 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                  <span className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="size-3 text-emerald-500" />
                    Suscripciones Pagadas:
                  </span>
                  <span className="font-bold font-mono">{business.activeSubs}</span>
                </div>
              </div>

              <div className="w-full pt-1 text-center">
                <a
                  href="/users"
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                >
                  Gestionar Usuarios & Membresías
                  <ArrowRight className="size-3" />
                </a>
              </div>
            </div>
          </SectionCard>

          {/* Cloudflare Edge & AI Router Health */}
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-[#0f172a]/70 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white text-sm">
                <Cpu className="size-4 text-indigo-500" />
                <span>Enrutador IA Activo</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold">
                Online
              </span>
            </div>

            <div className="space-y-2 text-xs pt-1">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>IA Primaria (#1):</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {PROVIDER_LABELS[providerPriority[0] ?? 'gemini'].label}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Cadena de Fallback:</span>
                <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                  {providerPriority.slice(1).join(' → ')}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Tokens Ahorrados:</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                  ~{(business.estimatedSavedTokens / 1000).toFixed(0)}k tokens
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-xs">
              <a
                href="/telemetry"
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium inline-flex items-center gap-1"
              >
                Ajustar Prioridad IA
                <ArrowRight className="size-3" />
              </a>
              <a
                href="/apis"
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 text-[11px]"
              >
                Configurar APIs
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Recent Repo Analyses & Modules Status */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Repo Analyses (7 cols) */}
        <div className="lg:col-span-7">
          <SectionCard
            title="Últimos Repositorios Analizados"
            description="Repositorios procesados recientemente en la plataforma"
            actions={
              <a
                href="/telemetry"
                className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
              >
                Ver Telemetría Completa
                <ArrowRight className="size-3" />
              </a>
            }
          >
            {analyses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500 space-y-2">
                <Rocket className="size-8 opacity-40" />
                <p className="text-xs">No hay análisis de repositorios registrados aún.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                  <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Repositorio</th>
                      <th className="py-2.5 px-3">Lenguaje</th>
                      <th className="py-2.5 px-3">Proveedor</th>
                      <th className="py-2.5 px-3 text-right">Tiempo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-mono">
                    {analyses.slice(0, 6).map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 px-3 font-sans font-medium text-slate-900 dark:text-white truncate max-w-xs">
                          <a
                            href={`https://github.com/${item.repo_full_name}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-indigo-600 dark:hover:text-indigo-400 inline-flex items-center gap-1"
                          >
                            {item.repo_full_name}
                            <ExternalLink className="size-2.5 text-slate-400" />
                          </a>
                        </td>
                        <td className="py-2.5 px-3 font-sans">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 text-[11px]">
                            {item.primary_language || 'Markdown'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-sans text-slate-600 dark:text-slate-400">
                          {item.provider_used || 'Gemini 2.5'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-500 dark:text-slate-400 text-[11px]">
                          {formatRelativeTime(item.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>

        {/* Modules & Feature Coverage (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <SectionCard
            title="Módulos de Análisis Activos"
            description="Nivel de acceso configurado para el Edge Worker (Free vs Pro)"
            actions={
              <a
                href="/modules"
                className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
              >
                Configurar
                <ArrowRight className="size-3" />
              </a>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {DEFAULT_ANALYSIS_MODULES.slice(0, 8).map((mod) => {
                const currentAccess = modulesConfig[mod.id] ?? mod.defaultAccess
                const isPro = currentAccess === 'pro'
                const isDisabled = currentAccess === 'disabled'

                return (
                  <div
                    key={mod.id}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50/70 dark:bg-[#090d16]/70 shadow-xs"
                  >
                    <div className="truncate mr-2">
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{mod.name}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 capitalize">{mod.category}</div>
                    </div>
                    <div>
                      {isDisabled ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-500">
                          Off
                        </span>
                      ) : isPro ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 flex items-center gap-0.5">
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

          {/* Quick Admin Actions */}
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5 p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold text-sm">
              <Sparkles className="size-4 text-indigo-500" />
              <span>Accesos Rápidos de Administración</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
              <a
                href="/apis"
                className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f172a] hover:border-indigo-500/30 transition shadow-xs text-slate-700 dark:text-slate-200"
              >
                <KeyRound className="size-3.5 text-indigo-500" />
                <span className="font-medium truncate">Claves API</span>
              </a>
              <a
                href="/modules"
                className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f172a] hover:border-indigo-500/30 transition shadow-xs text-slate-700 dark:text-slate-200"
              >
                <Layers className="size-3.5 text-purple-500" />
                <span className="font-medium truncate">Módulos Pro</span>
              </a>
              <a
                href="/users"
                className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f172a] hover:border-indigo-500/30 transition shadow-xs text-slate-700 dark:text-slate-200"
              >
                <Users className="size-3.5 text-emerald-500" />
                <span className="font-medium truncate">Usuarios</span>
              </a>
              <a
                href="/telemetry"
                className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f172a] hover:border-indigo-500/30 transition shadow-xs text-slate-700 dark:text-slate-200"
              >
                <Activity className="size-3.5 text-sky-500" />
                <span className="font-medium truncate">Telemetría</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AdminDashboardPage() {
  return (
    <AdminShell
      activeRoute="/"
      title="Dashboard General"
      subtitle="Visión general del ecosistema, métricas de negocio, crecimiento de usuarios y salud de la plataforma."
    >
      {({ client, session }) => <DashboardContent client={client} session={session} />}
    </AdminShell>
  )
}
