'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Code2, Database, Eye, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { AdminShell, SectionCard, StatusBanner } from '../../lib/admin-shell'
import type { RepoAnalysisRow } from '../../lib/admin-types'
import { buildRepoCacheKey } from '../../lib/kv-sync'
import {
  type AdminSession,
  type AdminSupabaseClient,
  dispatchServerCachePurge,
  fetchRepoAnalyses
} from '../../lib/supabase-client'

function CacheExplorerContent({
  client,
  session
}: {
  client: AdminSupabaseClient
  session: AdminSession
}) {
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<RepoAnalysisRow[]>([])
  const [selected, setSelected] = useState<RepoAnalysisRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [purgingId, setPurgingId] = useState<string | null>(null)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const loadEntries = useCallback(
    async (searchText = query) => {
      setLoading(true)
      const res = await fetchRepoAnalyses(client, searchText)
      if (res.error) {
        setStatus({ type: 'error', message: `Failed to load cached analyses: ${res.error}` })
      }
      setEntries(res.data)
      setLoading(false)
    },
    [client, query]
  )

  useEffect(() => {
    void loadEntries('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client])

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault()
    await loadEntries(query)
  }

  async function handlePurge(row: RepoAnalysisRow) {
    setPurgingId(row.id)
    setStatus(null)

    const res = await dispatchServerCachePurge(
      row.repo_full_name,
      row.commit_sha,
      session.accessToken
    )
    setPurgingId(null)

    if (!res.success) {
      setStatus({ type: 'error', message: res.error ?? 'Failed to purge cache entry' })
      return
    }

    setEntries((prev) => prev.filter((item) => item.id !== row.id))
    if (selected?.id === row.id) {
      setSelected(null)
    }

    const kvKey = buildRepoCacheKey(row.repo_full_name, row.commit_sha)
    setStatus({
      type: 'success',
      message: `Purged ${row.repo_full_name}@${row.commit_sha.slice(0, 7)} from KV (${kvKey}) and Supabase.`
    })
  }

  return (
    <div className="space-y-6">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      <SectionCard
        title="Análisis de Repositorios en Caché (KV & BD)"
        description="Busca en repo_analyses por owner/repo, inspecciona payloads de IA cacheados o purga entradas de Cloudflare KV."
        actions={
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <div className="relative">
              <Search className="size-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="owner/repo (ej. facebook/react)..."
                className="w-48 sm:w-64 rounded-xl border border-white/10 bg-[#090d16] pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-3.5 py-1.5 text-xs font-semibold text-white transition shadow-sm"
            >
              Buscar
            </button>
            <button
              type="button"
              onClick={() => void loadEntries('')}
              className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-2 text-slate-300 transition"
              aria-label="Refrescar lista de caché"
            >
              <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </form>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/10 text-slate-400 uppercase tracking-wider text-[10px] font-semibold bg-white/[0.02]">
              <tr>
                <th className="py-3 px-4">Repositorio</th>
                <th className="py-3 px-4">Commit SHA</th>
                <th className="py-3 px-4">Proveedor IA</th>
                <th className="py-3 px-4">Tokens Consumidos</th>
                <th className="py-3 px-4">Actualizado</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 font-sans">
                    {loading ? 'Cargando análisis cacheados...' : 'No se encontraron análisis en caché.'}
                  </td>
                </tr>
              ) : (
                entries.map((row) => {
                  const isSelected = selected?.id === row.id
                  return (
                    <tr
                      key={row.id}
                      className={`transition-colors ${isSelected ? 'bg-indigo-500/10' : 'hover:bg-white/[0.03]'}`}
                    >
                      <td className="py-3 px-4 font-sans font-semibold text-white truncate max-w-xs">
                        {row.repo_full_name}
                      </td>
                      <td className="py-3 px-4">
                        <span className="rounded-md border border-white/10 bg-[#090d16] px-2 py-0.5 text-[11px] text-slate-300">
                          {row.commit_sha.slice(0, 7)}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-sans">
                        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-300">
                          {row.provider_used || 'cache'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        {row.tokens_consumed?.toLocaleString() ?? 0}
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-[11px]">
                        {new Date(row.updated_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap font-sans">
                        <button
                          type="button"
                          onClick={() => setSelected(isSelected ? null : row)}
                          className={`rounded-xl border px-3 py-1 text-xs transition ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-600 text-white'
                              : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          <Eye className="size-3.5 inline mr-1" />
                          {isSelected ? 'Ocultar' : 'Inspeccionar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handlePurge(row)}
                          disabled={purgingId === row.id}
                          className="rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1 text-xs text-rose-300 transition"
                        >
                          <Trash2 className="size-3.5 inline mr-1" />
                          {purgingId === row.id ? 'Purgando...' : 'Purgar KV'}
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Payload Inspection Card */}
      {selected && (
        <SectionCard
          title={`Payload Cacheados: ${selected.repo_full_name} (${selected.commit_sha.slice(0, 7)})`}
          description="Estructura JSON y diagrama Mermaid almacenados en el caché perimetral."
          actions={
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-1.5 text-slate-300"
              aria-label="Cerrar visor"
            >
              <X className="size-4" />
            </button>
          }
        >
          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <Code2 className="size-3.5 text-indigo-400" />
                Resumen Ejecutivo JSON (summary_json)
              </div>
              <pre className="max-h-72 overflow-auto rounded-2xl border border-white/10 bg-[#090d16] p-4 font-mono text-[11px] leading-relaxed text-slate-200">
                {JSON.stringify(selected.summary_json, null, 2)}
              </pre>
            </div>

            {selected.architecture_diagram && (
              <div>
                <div className="text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                  <Database className="size-3.5 text-emerald-400" />
                  Diagrama Mermaid de Arquitectura (architecture_diagram)
                </div>
                <pre className="max-h-56 overflow-auto rounded-2xl border border-white/10 bg-[#090d16] p-4 font-mono text-[11px] leading-relaxed text-emerald-300">
                  {selected.architecture_diagram}
                </pre>
              </div>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  )
}

export default function CacheExplorerPage() {
  return (
    <AdminShell
      activeRoute="/cache"
      title="Explorador de Caché KV & Base de Datos"
      subtitle="Inspecciona análisis de repositorios cacheados en Cloudflare KV y Supabase, y fuerza invalidaciones selectivas."
    >
      {({ client, session }) => <CacheExplorerContent client={client} session={session} />}
    </AdminShell>
  )
}
