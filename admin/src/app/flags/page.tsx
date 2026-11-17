'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { AlertOctagon, GitBranch, MessageSquare, Save, Sliders } from 'lucide-react'
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
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          <div className="text-sm font-medium text-white">{label}</div>
          <div className="text-xs text-slate-400 mt-0.5">{description}</div>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          checked
            ? danger
              ? 'bg-rose-600'
              : 'bg-indigo-600'
            : 'bg-slate-700'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
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
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Syncing to KV...' : 'Save Quotas & Feature Flags'}
        </button>
      </div>

      <SectionCard
        title="Daily Quota Limits"
        description="Adjust rate-limiter ceilings dynamically without redeploying the Cloudflare Worker."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="free-limit" className="text-sm font-medium text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-sky-400" />
                Free Daily Limit
              </label>
              <span className="font-mono text-sm font-semibold text-sky-300">{freeLimit} / day</span>
            </div>
            <input
              id="free-limit"
              type="range"
              min={1}
              max={100}
              value={freeLimit}
              onChange={(e) => setFreeLimit(Number(e.target.value))}
              className="w-full accent-sky-500"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400">KV key: free_daily_limit</span>
              <input
                type="number"
                min={1}
                max={100}
                value={freeLimit}
                onChange={(e) => setFreeLimit(Math.max(1, Number(e.target.value) || 1))}
                className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-right font-mono text-xs text-white"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="pro-limit" className="text-sm font-medium text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" />
                Pro Daily Limit
              </label>
              <span className="font-mono text-sm font-semibold text-indigo-300">{proLimit} / day</span>
            </div>
            <input
              id="pro-limit"
              type="range"
              min={25}
              max={2000}
              step={25}
              value={proLimit}
              onChange={(e) => setProLimit(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400">KV key: pro_daily_limit</span>
              <input
                type="number"
                min={1}
                max={5000}
                value={proLimit}
                onChange={(e) => setProLimit(Math.max(1, Number(e.target.value) || 1))}
                className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-right font-mono text-xs text-white"
              />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Remote Feature Flags"
        description="KV key: feature_flags — broadcast live feature toggles and maintenance banners to extensions."
      >
        <div className="space-y-3">
          <ToggleRow
            label="Mascot Assistant Enabled"
            description="Controls mascot_enabled flag for floating mascot and /v1/mascot/chat."
            checked={flags.mascot_enabled}
            icon={<MessageSquare className="w-4 h-4 text-emerald-400" />}
            onChange={(next) => setFlags((prev) => ({ ...prev, mascot_enabled: next }))}
          />
          <ToggleRow
            label="Architecture Diagrams Enabled"
            description="Controls diagrams_enabled flag for Mermaid architecture rendering in Pro results."
            checked={flags.diagrams_enabled}
            icon={<GitBranch className="w-4 h-4 text-sky-400" />}
            onChange={(next) => setFlags((prev) => ({ ...prev, diagrams_enabled: next }))}
          />
          <ToggleRow
            label="Maintenance Mode"
            description="Controls maintenance_mode flag to pause incoming requests with a maintenance notice."
            checked={flags.maintenance_mode}
            danger
            icon={<AlertOctagon className="w-4 h-4 text-rose-400" />}
            onChange={(next) => setFlags((prev) => ({ ...prev, maintenance_mode: next }))}
          />

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
            <label htmlFor="banner-message" className="block text-sm font-medium text-white">
              Global Banner Message (optional)
            </label>
            <input
              id="banner-message"
              type="text"
              value={flags.banner_message ?? ''}
              onChange={(e) => setFlags((prev) => ({ ...prev, banner_message: e.target.value }))}
              placeholder="e.g. New Gemini 2.5 engine enabled for all repositories!"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

export function FeatureFlagsView({
  injectedClient,
  injectedSession
}: {
  injectedClient?: AdminSupabaseClient
  injectedSession?: AdminSession
} = {}) {
  return (
    <AdminShell
      activeRoute="/flags"
      title="Feature Flags & Quotas"
      subtitle="Control Free/Pro daily rate limits, runtime toggles, and global extension banners."
      injectedClient={injectedClient}
      injectedSession={injectedSession}
    >
      {({ client, session }) => <FlagsQuotasContent client={client} session={session} />}
    </AdminShell>
  )
}

export default function FeatureFlagsPage() {
  return <FeatureFlagsView />
}
