'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Code2, Database, Eye, RefreshCw, Search, Trash2 } from 'lucide-react'
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
        title="Cached Repository Analyses"
        description="Search repo_analyses by owner/repo, inspect cached AI payloads, or force KV + DB purge."
        actions={
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="owner/repo..."
                className="rounded-lg border border-slate-700 bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => void loadEntries(query)}
              className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 p-1.5 text-slate-300"
              aria-label="Refresh cache list"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </form>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="py-2.5 pr-4">Repository</th>
                <th className="py-2.5 pr-4">Commit SHA</th>
                <th className="py-2.5 pr-4">Provider</th>
                <th className="py-2.5 pr-4">Tokens</th>
                <th className="py-2.5 pr-4">Cached At</th>
                <th className="py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    {loading ? 'Loading cached analyses...' : 'No cached repository analyses found.'}
                  </td>
                </tr>
              ) : (
                entries.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-800/30">
                    <td className="py-3 pr-4">
                      <div className="font-medium text-white flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        {row.repo_full_name}
                      </div>
                      {row.primary_language && (
                        <div className="text-[11px] text-slate-400">{row.primary_language}</div>
                      )}
                    </td>
                    <td className="py-3 pr-4 font-mono text-slate-300">
                      {row.commit_sha.slice(0, 12)}
                    </td>
                    <td className="py-3 pr-4 font-mono text-indigo-300">
                      {row.provider_used ?? '—'}
                    </td>
                    <td className="py-3 pr-4 font-mono text-slate-300">
                      {row.tokens_consumed.toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 text-slate-400">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelected(selected?.id === row.id ? null : row)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-[11px] text-slate-200"
                      >
                        <Eye className="w-3 h-3" />
                        {selected?.id === row.id ? 'Hide JSON' : 'Inspect'}
                      </button>
                      <button
                        type="button"
                        disabled={purgingId === row.id}
                        onClick={() => void handlePurge(row)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/15 hover:bg-rose-500/25 disabled:opacity-50 px-2.5 py-1 text-[11px] font-semibold text-rose-200"
                      >
                        <Trash2 className="w-3 h-3" />
                        {purgingId === row.id ? 'Purging...' : 'Purge Cache'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {selected && (
        <SectionCard
          title={`Payload Inspector: ${selected.repo_full_name}`}
          description={`KV key: ${buildRepoCacheKey(selected.repo_full_name, selected.commit_sha) ?? 'invalid'}`}
          actions={
            <span className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-400">
              <Code2 className="w-3.5 h-3.5 text-indigo-400" />
              {selected.provider_used ?? 'unknown'} · {selected.tokens_consumed} tokens
            </span>
          }
        >
          <pre className="max-h-96 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-200">
            {JSON.stringify(
              {
                summary_json: selected.summary_json,
                architecture_diagram: selected.architecture_diagram
              },
              null,
              2
            )}
          </pre>
        </SectionCard>
      )}
    </div>
  )
}

export function CacheExplorerView({
  injectedClient,
  injectedSession
}: {
  injectedClient?: AdminSupabaseClient
  injectedSession?: AdminSession
} = {}) {
  return (
    <AdminShell
      activeRoute="/cache"
      title="Cache Explorer & Invalidation"
      subtitle="Inspect cached repository analyses and purge entries from Cloudflare KV and Supabase simultaneously."
      injectedClient={injectedClient}
      injectedSession={injectedSession}
    >
      {({ client, session }) => <CacheExplorerContent client={client} session={session} />}
    </AdminShell>
  )
}

export default function CacheExplorerPage() {
  return <CacheExplorerView />
}
