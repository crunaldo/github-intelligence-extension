'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Bot, FileCode2, RotateCcw, Save, Sparkles } from 'lucide-react'
import { AdminShell, SectionCard, StatusBanner } from '../../lib/admin-shell'
import {
  DEFAULT_SYSTEM_PROMPT_MASCOT,
  DEFAULT_SYSTEM_PROMPT_REPO
} from '../../lib/admin-types'
import {
  type AdminSession,
  type AdminSupabaseClient,
  dispatchServerConfigSync,
  fetchRemoteConfigsMap
} from '../../lib/supabase-client'

function extractStringConfig(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

function PromptsStudioContent({
  client,
  session
}: {
  client: AdminSupabaseClient
  session: AdminSession
}) {
  const [repoPrompt, setRepoPrompt] = useState(DEFAULT_SYSTEM_PROMPT_REPO)
  const [mascotPrompt, setMascotPrompt] = useState(DEFAULT_SYSTEM_PROMPT_MASCOT)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const loadPrompts = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const configsRes = await fetchRemoteConfigsMap(client)
    if (configsRes.error) {
      setLoadError(configsRes.error)
      setStatus({
        type: 'error',
        message: `Failed to load remote prompts: ${configsRes.error}. Saving is disabled to prevent overwriting live configuration.`
      })
      setLoading(false)
      return
    }
    setRepoPrompt(extractStringConfig(configsRes.data.system_prompt_repo, DEFAULT_SYSTEM_PROMPT_REPO))
    setMascotPrompt(
      extractStringConfig(configsRes.data.system_prompt_mascot, DEFAULT_SYSTEM_PROMPT_MASCOT)
    )
    setLoading(false)
  }, [client])

  useEffect(() => {
    void loadPrompts()
  }, [loadPrompts])

  async function savePrompt(key: 'system_prompt_repo' | 'system_prompt_mascot', value: string) {
    if (loadError) return
    setSavingKey(key)
    setStatus(null)
    const res = await dispatchServerConfigSync(key, value, session.accessToken)
    setSavingKey(null)
    setStatus(
      res.success
        ? { type: 'success', message: `${key} saved to Supabase & replicated to Cloudflare KV.` }
        : { type: 'error', message: res.error ?? `Failed to sync ${key}` }
    )
  }

  async function saveAllPrompts() {
    if (loadError) return
    setSavingKey('all')
    setStatus(null)
    const [repoRes, mascotRes] = await Promise.all([
      dispatchServerConfigSync('system_prompt_repo', repoPrompt, session.accessToken),
      dispatchServerConfigSync('system_prompt_mascot', mascotPrompt, session.accessToken)
    ])
    setSavingKey(null)
    if (repoRes.success && mascotRes.success) {
      setStatus({
        type: 'success',
        message: 'Both system_prompt_repo and system_prompt_mascot synced to KV.'
      })
    } else {
      setStatus({
        type: 'error',
        message: repoRes.error || mascotRes.error || 'Failed to sync one or more prompts'
      })
    }
  }

  const saveDisabled = loading || savingKey !== null || loadError !== null

  return (
    <div className="space-y-6">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void saveAllPrompts()}
          disabled={saveDisabled}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition"
        >
          <Sparkles className="w-4 h-4" />
          {savingKey === 'all' ? 'Publishing...' : 'Publish All Prompts to KV'}
        </button>
      </div>

      <SectionCard
        title="Repository Analysis System Prompt"
        description="KV key: system_prompt_repo — controls how /v1/analyze structures repository summaries and Mermaid diagrams."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRepoPrompt(DEFAULT_SYSTEM_PROMPT_REPO)}
              disabled={loadError !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-slate-300"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
            <button
              type="button"
              onClick={() => void savePrompt('system_prompt_repo', repoPrompt)}
              disabled={saveDisabled}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3.5 py-1.5 text-xs font-semibold text-white"
            >
              <Save className="w-3.5 h-3.5" />
              {savingKey === 'system_prompt_repo' ? 'Saving...' : 'Save Repo Prompt'}
            </button>
          </div>
        }
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5 font-mono">
              <FileCode2 className="w-3.5 h-3.5 text-indigo-400" />
              system_prompt_repo
            </span>
            <span>
              {repoPrompt.length} chars · ~{Math.ceil(repoPrompt.length / 4)} tokens
            </span>
          </div>
          <textarea
            rows={8}
            value={repoPrompt}
            onChange={(e) => setRepoPrompt(e.target.value)}
            disabled={loading || loadError !== null}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-slate-100 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Mascot Personality & Boundaries"
        description="KV key: system_prompt_mascot — controls tone, boundaries, and context usage for Pro mascot chat."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMascotPrompt(DEFAULT_SYSTEM_PROMPT_MASCOT)}
              disabled={loadError !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-slate-300"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
            <button
              type="button"
              onClick={() => void savePrompt('system_prompt_mascot', mascotPrompt)}
              disabled={saveDisabled}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3.5 py-1.5 text-xs font-semibold text-white"
            >
              <Save className="w-3.5 h-3.5" />
              {savingKey === 'system_prompt_mascot' ? 'Saving...' : 'Save Mascot Prompt'}
            </button>
          </div>
        }
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5 font-mono">
              <Bot className="w-3.5 h-3.5 text-emerald-400" />
              system_prompt_mascot
            </span>
            <span>
              {mascotPrompt.length} chars · ~{Math.ceil(mascotPrompt.length / 4)} tokens
            </span>
          </div>
          <textarea
            rows={8}
            value={mascotPrompt}
            onChange={(e) => setMascotPrompt(e.target.value)}
            disabled={loading || loadError !== null}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-slate-100 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
          />
        </div>
      </SectionCard>
    </div>
  )
}

export function PromptsStudioView({
  injectedClient,
  injectedSession
}: {
  injectedClient?: AdminSupabaseClient
  injectedSession?: AdminSession
} = {}) {
  return (
    <AdminShell
      activeRoute="/prompts"
      title="Prompt & Mascot Personality Studio"
      subtitle="Edit live Edge AI system prompts and publish updates directly to Supabase and Cloudflare KV."
      injectedClient={injectedClient}
      injectedSession={injectedSession}
    >
      {({ client, session }) => <PromptsStudioContent client={client} session={session} />}
    </AdminShell>
  )
}

export default function PromptsStudioPage() {
  return <PromptsStudioView />
}
