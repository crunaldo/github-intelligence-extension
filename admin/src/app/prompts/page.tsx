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
        ? { type: 'success', message: `${key} guardado en Supabase y replicado a Cloudflare KV.` }
        : { type: 'error', message: res.error ?? `Error al sincronizar ${key}` }
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
        message: 'Ambos prompts (system_prompt_repo y system_prompt_mascot) sincronizados con éxito a KV.'
      })
    } else {
      setStatus({
        type: 'error',
        message: repoRes.error || mascotRes.error || 'Fallo al sincronizar los prompts'
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
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 px-5 py-2.5 text-xs font-semibold text-white transition shadow-md shadow-indigo-600/20 active:scale-[0.98]"
        >
          <Sparkles className="size-4" />
          {savingKey === 'all' ? 'Publicando...' : 'Publicar Todos los Prompts a KV'}
        </button>
      </div>

      <SectionCard
        title="Prompt del Sistema para Análisis de Repositorios"
        description="Clave KV: system_prompt_repo — controla cómo /v1/analyze estructura los resúmenes de proyectos y los diagramas Mermaid."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRepoPrompt(DEFAULT_SYSTEM_PROMPT_REPO)}
              disabled={loadError !== null}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-slate-300 transition"
            >
              <RotateCcw className="size-3.5" />
              Restablecer
            </button>
            <button
              type="button"
              onClick={() => void savePrompt('system_prompt_repo', repoPrompt)}
              disabled={saveDisabled}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3.5 py-1.5 text-xs font-semibold text-white transition shadow-sm"
            >
              <Save className="size-3.5" />
              {savingKey === 'system_prompt_repo' ? 'Guardando...' : 'Guardar Prompt Repo'}
            </button>
          </div>
        }
      >
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5 font-mono text-indigo-300">
              <FileCode2 className="size-3.5 text-indigo-400" />
              system_prompt_repo
            </span>
            <span className="font-mono text-[11px] bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
              {repoPrompt.length} caracteres · ~{Math.ceil(repoPrompt.length / 4)} tokens
            </span>
          </div>
          <textarea
            rows={9}
            value={repoPrompt}
            onChange={(e) => setRepoPrompt(e.target.value)}
            disabled={loading || loadError !== null}
            className="w-full rounded-2xl border border-white/10 bg-[#090d16] p-4 font-mono text-xs leading-relaxed text-slate-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none disabled:opacity-50 transition"
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Personalidad & Directivas de la Mascota IA (Octocat)"
        description="Clave KV: system_prompt_mascot — controla el tono, límites, emojis y contexto de repositorio para el chat de la mascota."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMascotPrompt(DEFAULT_SYSTEM_PROMPT_MASCOT)}
              disabled={loadError !== null}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-slate-300 transition"
            >
              <RotateCcw className="size-3.5" />
              Restablecer
            </button>
            <button
              type="button"
              onClick={() => void savePrompt('system_prompt_mascot', mascotPrompt)}
              disabled={saveDisabled}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3.5 py-1.5 text-xs font-semibold text-white transition shadow-sm"
            >
              <Save className="size-3.5" />
              {savingKey === 'system_prompt_mascot' ? 'Guardando...' : 'Guardar Prompt Mascota'}
            </button>
          </div>
        }
      >
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5 font-mono text-pink-300">
              <Bot className="size-3.5 text-pink-400" />
              system_prompt_mascot
            </span>
            <span className="font-mono text-[11px] bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
              {mascotPrompt.length} caracteres · ~{Math.ceil(mascotPrompt.length / 4)} tokens
            </span>
          </div>
          <textarea
            rows={9}
            value={mascotPrompt}
            onChange={(e) => setMascotPrompt(e.target.value)}
            disabled={loading || loadError !== null}
            className="w-full rounded-2xl border border-white/10 bg-[#090d16] p-4 font-mono text-xs leading-relaxed text-slate-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none disabled:opacity-50 transition"
          />
        </div>
      </SectionCard>
    </div>
  )
}

function PromptsStudioView({
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
      subtitle="Edita en vivo los prompts de sistema de IA del Worker Edge y publícalos directamente a Cloudflare KV."
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
