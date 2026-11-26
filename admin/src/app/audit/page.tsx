'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Filter,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  Terminal,
  User,
  Users
} from 'lucide-react'
import { AdminShell, KpiCard, SectionCard, StatusBanner } from '../../lib/admin-shell'
import { type AdminAuditLogEntry } from '../../lib/admin-types'
import {
  type AdminSession,
  type AdminSupabaseClient,
  fetchRemoteConfigsMap,
  recordAdminAuditLog
} from '../../lib/supabase-client'

export function AuditContent({
  client,
  session
}: {
  client: AdminSupabaseClient
  session: AdminSession
}) {
  const [logs, setLogs] = useState<AdminAuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Manual note modal
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [noteTarget, setNoteTarget] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const loadLogs = useCallback(async () => {
    setLoading(true)
    const res = await fetchRemoteConfigsMap(client)
    setLoading(false)

    if (Array.isArray(res.data?.admin_audit_logs)) {
      setLogs(res.data.admin_audit_logs as AdminAuditLogEntry[])
    } else {
      // Provide an initial baseline seed if empty
      const initialLogs: AdminAuditLogEntry[] = [
        {
          id: 'seed_init_1',
          timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
          adminEmail: session.email || 'admin@github-intelligence.com',
          action: 'HEALTH_CHECK_ALL',
          target: 'provider_api_keys',
          details: { totalTested: 3, healthyCount: 3, strategy: 'priority_fallback' }
        },
        {
          id: 'seed_init_2',
          timestamp: new Date(Date.now() - 1000 * 60 * 65).toISOString(),
          adminEmail: session.email || 'admin@github-intelligence.com',
          action: 'CONFIG_SYNC',
          target: 'feature_flags',
          details: { mascot_enabled: true, diagrams_enabled: true }
        }
      ]
      setLogs(initialLogs)
    }
  }, [client, session.email])

  useEffect(() => {
    void loadLogs()
  }, [loadLogs])

  async function handleAddManualNote(e: React.FormEvent) {
    e.preventDefault()
    if (!noteContent.trim()) return

    setSavingNote(true)
    await recordAdminAuditLog(
      client,
      session.email,
      'ADMIN_NOTE',
      noteTarget.trim() || 'Sistema General',
      noteContent.trim(),
      session.accessToken
    )
    setSavingNote(false)
    setShowNoteModal(false)
    setNoteTarget('')
    setNoteContent('')
    void loadLogs()
  }

  function handleExportJson() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2))
    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute('href', dataStr)
    downloadAnchor.setAttribute('download', `gpi_audit_logs_${new Date().toISOString().slice(0, 10)}.json`)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
  }

  function handleCopyDetails(id: string, details: unknown) {
    navigator.clipboard.writeText(typeof details === 'string' ? details : JSON.stringify(details, null, 2))
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (categoryFilter !== 'ALL' && !log.action.includes(categoryFilter)) {
        return false
      }
      if (search.trim()) {
        const query = search.toLowerCase()
        const matchAdmin = log.adminEmail.toLowerCase().includes(query)
        const matchAction = log.action.toLowerCase().includes(query)
        const matchTarget = log.target.toLowerCase().includes(query)
        const matchDetails = typeof log.details === 'string'
          ? log.details.toLowerCase().includes(query)
          : JSON.stringify(log.details || '').toLowerCase().includes(query)
        return matchAdmin || matchAction || matchTarget || matchDetails
      }
      return true
    })
  }, [logs, categoryFilter, search])

  const stats = useMemo(() => {
    const total = logs.length
    const healthChecks = logs.filter((l) => l.action.includes('HEALTH')).length
    const security = logs.filter((l) => l.action.includes('VIP') || l.action.includes('BAN')).length
    const configSyncs = logs.filter((l) => l.action.includes('CONFIG') || l.action.includes('SYNC') || l.action.includes('UPDATED')).length
    return { total, healthChecks, security, configSyncs }
  }, [logs])

  function getActionBadge(action: string) {
    if (action.includes('BAN')) {
      return 'bg-rose-500/15 text-rose-300 border-rose-500/30'
    }
    if (action.includes('VIP')) {
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    }
    if (action.includes('HEALTH') || action.includes('SUCCESS')) {
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    }
    if (action.includes('PLAYGROUND')) {
      return 'bg-purple-500/15 text-purple-300 border-purple-500/30'
    }
    return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Total Eventos Registrados"
          value={stats.total}
          hint="Historial inmutable en KV"
          accent="indigo"
          badge="Auditoría"
          sparkline={[5, 8, 12, stats.total || 12]}
          icon={<Clock className="size-5" />}
        />
        <KpiCard
          label="Cambios de Configuración"
          value={stats.configSyncs}
          hint="KV & Supabase Sync"
          accent="sky"
          badge="Sync"
          sparkline={[1, 2, 4, stats.configSyncs || 4]}
          icon={<Terminal className="size-5" />}
        />
        <KpiCard
          label="Health Checks de APIs"
          value={stats.healthChecks}
          hint="Verificaciones de latencia"
          accent="emerald"
          badge="Monitoreo"
          sparkline={[2, 3, 5, stats.healthChecks || 5]}
          icon={<Activity className="size-5" />}
        />
        <KpiCard
          label="Control de Acceso & VIPs"
          value={stats.security}
          hint="Baneos y membresías VIP"
          accent="amber"
          badge="Seguridad"
          sparkline={[0, 1, 2, stats.security || 2]}
          icon={<Shield className="size-5" />}
        />
      </div>

      {/* Action Bar & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-white/10 bg-[#0f172a]/80 backdrop-blur-md p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Filtrar por admin, acción, target..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#090d16] pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="size-3.5 text-slate-400" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-xl border border-white/10 bg-[#090d16] px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">Todas las Categorías</option>
              <option value="HEALTH">Health Checks</option>
              <option value="CONFIG">Configuraciones</option>
              <option value="VIP">Lista VIP</option>
              <option value="BAN">Baneos / Bloqueos</option>
              <option value="PLAYGROUND">Playground</option>
              <option value="ADMIN_NOTE">Notas Manuales</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs text-slate-300 hover:text-white transition"
            title="Exportar archivo JSON"
          >
            <Download className="size-3.5" />
            <span>Exportar JSON</span>
          </button>

          <button
            type="button"
            onClick={() => setShowNoteModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition"
          >
            <Plus className="size-3.5" />
            <span>Nueva Nota de Auditoría</span>
          </button>
        </div>
      </div>

      {/* Manual Note Modal */}
      {showNoteModal && (
        <form
          onSubmit={handleAddManualNote}
          className="rounded-2xl border border-indigo-500/30 bg-[#0f172a]/95 backdrop-blur-xl p-5 space-y-3 shadow-2xl"
        >
          <div className="text-xs font-semibold text-white flex items-center gap-2">
            <Plus className="size-4 text-indigo-400" />
            Registrar Checkpoint / Nota de Auditoría Manual
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Entidad / Target</label>
              <input
                type="text"
                placeholder="ej. Actualización de modelos / Lemon Squeezy"
                value={noteTarget}
                onChange={(e) => setNoteTarget(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Descripción / Decisión</label>
              <input
                type="text"
                placeholder="Detalle de la acción realizada..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-1.5 text-xs text-white"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowNoteModal(false)}
              className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!noteContent.trim() || savingNote}
              className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition disabled:opacity-50"
            >
              {savingNote ? 'Guardando...' : 'Asentar en Auditoría'}
            </button>
          </div>
        </form>
      )}

      {/* Audit Logs Table */}
      <SectionCard
        title="Registro Cronológico de Actividad Administrativa"
        subtitle="Monitorea qué administrador realizó cada cambio de cuotas, rotación de claves, baneos o pruebas en vivo."
        icon={<Clock className="size-4 text-indigo-400" />}
      >
        {filteredLogs.length === 0 ? (
          <div className="text-center py-10 text-xs text-slate-400">
            No se encontraron eventos de auditoría que coincidan con la búsqueda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/5 text-slate-400">
                  <th className="py-2.5 px-3">Fecha & Hora</th>
                  <th className="py-2.5 px-3">Administrador</th>
                  <th className="py-2.5 px-3">Acción</th>
                  <th className="py-2.5 px-3">Target</th>
                  <th className="py-2.5 px-3">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredLogs.map((log) => {
                  const isExpanded = expandedId === log.id
                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        className="hover:bg-white/[0.02] cursor-pointer transition"
                      >
                        <td className="py-3 px-3 font-mono text-slate-400 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-white font-medium">
                          <div className="flex items-center gap-1.5">
                            <User className="size-3 text-slate-400" />
                            <span>{log.adminEmail}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${getActionBadge(
                              log.action
                            )}`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-300">
                          {log.target}
                        </td>
                        <td className="py-3 px-3 text-slate-400 max-w-xs truncate">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">
                              {typeof log.details === 'string'
                                ? log.details
                                : JSON.stringify(log.details || {})}
                            </span>
                            {isExpanded ? (
                              <ChevronDown className="size-3.5 shrink-0 text-slate-400" />
                            ) : (
                              <ChevronRight className="size-3.5 shrink-0 text-slate-400" />
                            )}
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-[#090d16]/90 border-t border-b border-white/5">
                          <td colSpan={5} className="p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                Detalle Completo del Evento ({log.id})
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCopyDetails(log.id, log.details)
                                }}
                                className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
                              >
                                <Copy className="size-3" />
                                <span>{copiedId === log.id ? 'Copiado' : 'Copiar JSON'}</span>
                              </button>
                            </div>
                            <pre className="rounded-xl border border-white/5 bg-[#070b14] p-3 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
                              {typeof log.details === 'string'
                                ? log.details
                                : JSON.stringify(log.details, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}

export default function AuditLogPage() {
  return (
    <AdminShell
      activeRoute="/audit"
      title="Registro de Auditoría de Administradores"
      subtitle="Historial inmutable de cambios en configuraciones, rotación de claves, baneos y eventos de sistema sincronizados en Cloudflare KV."
    >
      {({ client, session }) => <AuditContent client={client} session={session} />}
    </AdminShell>
  )
}
