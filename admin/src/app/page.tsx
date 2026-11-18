'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Cpu,
  Gauge,
  GripVertical,
  RefreshCw,
  Save,
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

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const [logsRes, configsRes] = await Promise.all([
      fetchRecentQueryLogs(client, 500),
      fetchRemoteConfigsMap(client)
    ])

    const errors = [logsRes.error, configsRes.error].filter(Boolean)
    if (errors.length > 0) {
      const msg = errors.join(' | ')
      setLoadError(msg)
      setStatus({ type: 'error', message: `Failed to load dashboard data: ${msg}` })
    }

    setLogs(logsRes.data)
    if (!configsRes.error) {
      setPriority(normalizeProviderPriority(configsRes.data.provider_priority))
    }
    setLoading(false)
  }, [client])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const telemetry = useMemo(() => {
    const total = logs.length
    const proCount = logs.filter((l) => l.is_pro).length
    const freeCount = total - proCount
    const cacheHits = logs.filter((l) => l.cache_hit).length
    const cacheHitPct = total > 0 ? Math.round((cacheHits / total) * 1000) / 10 : 0

    const latencyValues = logs
      .map((l) => l.response_time_ms)
      .filter((ms): ms is number => typeof ms === 'number' && Number.isFinite(ms))
    const avgLatencyMs =
      latencyValues.length > 0
        ? Math.round(latencyValues.reduce((sum, n) => sum + n, 0) / latencyValues.length)
        : 0

    const byDay = new Map<string, DailyBucket>()
    for (const row of logs) {
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
      const matching = logs.filter((l) => l.provider === provider)
      const latencies = matching
        .map((l) => l.response_time_ms)
        .filter((ms): ms is number => typeof ms === 'number' && Number.isFinite(ms))
      const providerAvgLatency =
        latencies.length > 0
          ? Math.round(latencies.reduce((sum, n) => sum + n, 0) / latencies.length)
          : 0
      const nonCachedCount = logs.filter((l) => Boolean(l.provider)).length
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
      cacheHitPct,
      avgLatencyMs,
      dailySeries,
      providerStats
    }
  }, [logs])

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
        ? { type: 'success', message: `Provider priority synced to KV: ${priority.join(' → ')}` }
        : { type: 'error', message: res.error ?? 'Failed to sync provider priority' }
    )
  }

  const maxDailyTotal = Math.max(
    1,
    ...telemetry.dailySeries.map((bucket) => bucket.freeCount + bucket.proCount)
  )

  return (
    <div className="space-y-6">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Total Queries (Recent 500)"
          value={telemetry.total}
          hint={`${telemetry.freeCount} Free · ${telemetry.proCount} Pro`}
          accent="indigo"
          icon={<Activity className="w-4 h-4 text-indigo-400" />}
        />
        <KpiCard
          label="Cache Hit Ratio"
          value={`${telemetry.cacheHitPct}%`}
          hint={telemetry.cacheHitPct >= 75 ? 'Target >75% achieved' : 'Target: >75%'}
          accent={telemetry.cacheHitPct >= 75 ? 'emerald' : 'amber'}
          icon={<Zap className="w-4 h-4 text-emerald-400" />}
        />
        <KpiCard
          label="Average Latency"
          value={`${telemetry.avgLatencyMs} ms`}
          hint="Across logged Edge responses"
          accent="sky"
          icon={<Gauge className="w-4 h-4 text-sky-400" />}
        />
        <KpiCard
          label="Active Primary AI"
          value={PROVIDER_LABELS[priority[0] ?? 'gemini'].label}
          hint={`Fallback: ${priority.slice(1).join(' → ')}`}
          accent="indigo"
          icon={<Cpu className="w-4 h-4 text-indigo-400" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title="Daily Queries (Free vs Pro)"
          description="Last 7 active days from query_logs"
          actions={
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          }
        >
          {telemetry.dailySeries.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">No query telemetry recorded yet.</p>
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
          title="AI Provider Distribution & Health"
          description="Call volume and average latency across fallback chain"
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
                        {stat.calls} calls ({stat.sharePct}%)
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

      <SectionCard
        title="AI Provider Priority Order"
        description="Drag and drop or reorder fallback execution chain synced to Cloudflare KV (provider_priority)"
        actions={
          <button
            type="button"
            onClick={() => void handleSavePriority()}
            disabled={loading || saving || loadError !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Syncing KV...' : 'Save Priority'}
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
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 cursor-grab active:cursor-grabbing"
              >
                <div className="flex items-center gap-3">
                  <GripVertical className="w-4 h-4 text-slate-500" />
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-300">
                    {index + 1}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-white">{meta.label}</div>
                    <div className="text-xs font-mono text-slate-400">{provider}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveProvider(index, -1)}
                    disabled={index === 0}
                    className="rounded border border-slate-700 bg-slate-800 p-1 text-slate-300 hover:text-white disabled:opacity-30"
                    aria-label={`Move ${provider} up`}
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveProvider(index, 1)}
                    disabled={index === priority.length - 1}
                    className="rounded border border-slate-700 bg-slate-800 p-1 text-slate-300 hover:text-white disabled:opacity-30"
                    aria-label={`Move ${provider} down`}
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

function AdminDashboardView({
  injectedClient,
  injectedSession
}: {
  injectedClient?: AdminSupabaseClient
  injectedSession?: AdminSession
} = {}) {
  return (
    <AdminShell
      activeRoute="/"
      title="Telemetry & AI Providers"
      subtitle="Monitor daily Free vs Pro usage, Edge KV cache hit ratio, and AI provider fallback priority."
      injectedClient={injectedClient}
      injectedSession={injectedSession}
    >
      {({ client, session }) => <DashboardContent client={client} session={session} />}
    </AdminShell>
  )
}

export default function AdminDashboardPage() {
  return <AdminDashboardView />
}
