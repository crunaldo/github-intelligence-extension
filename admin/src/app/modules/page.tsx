'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Boxes,
  CheckCircle2,
  Cpu,
  Eye,
  FileCode,
  FolderTree,
  GitBranch,
  Layers,
  Lock,
  MessageSquare,
  PackageCheck,
  RefreshCw,
  Save,
  ShieldAlert,
  Sparkles,
  Terminal,
  Zap
} from 'lucide-react'
import { AdminShell, KpiCard, SectionCard, StatusBanner } from '../../lib/admin-shell'
import {
  DEFAULT_ANALYSIS_MODULES,
  DEFAULT_ANALYSIS_MODULES_MAP,
  type AnalysisModuleDef,
  type AnalysisModuleId,
  type AnalysisModulesMap,
  type ModuleAccessLevel
} from '../../lib/admin-types'
import {
  type AdminSession,
  type AdminSupabaseClient,
  dispatchServerConfigSync,
  fetchRemoteConfigsMap
} from '../../lib/supabase-client'

const MODULE_ICONS: Record<AnalysisModuleId, React.ReactNode> = {
  summary: <FileCode className="w-4 h-4 text-sky-400" />,
  installCommand: <Terminal className="w-4 h-4 text-emerald-400" />,
  cloudSandbox: <Zap className="w-4 h-4 text-indigo-400" />,
  hardwareCompat: <Cpu className="w-4 h-4 text-cyan-400" />,
  roadmap: <GitBranch className="w-4 h-4 text-amber-400" />,
  repoHealth: <PackageCheck className="w-4 h-4 text-emerald-400" />,
  architectureDiagram: <Layers className="w-4 h-4 text-indigo-400" />,
  deepAudit: <ShieldAlert className="w-4 h-4 text-rose-400" />,
  fileTree: <FolderTree className="w-4 h-4 text-sky-400" />,
  dependencies: <Boxes className="w-4 h-4 text-amber-400" />,
  mascotChat: <MessageSquare className="w-4 h-4 text-indigo-400" />,
  exportReport: <FileCode className="w-4 h-4 text-slate-400" />
}

function parseModulesMap(raw: unknown): AnalysisModulesMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_ANALYSIS_MODULES_MAP }
  }
  const obj = raw as Record<string, unknown>
  const result: AnalysisModulesMap = { ...DEFAULT_ANALYSIS_MODULES_MAP }
  for (const def of DEFAULT_ANALYSIS_MODULES) {
    const val = obj[def.id]
    if (val === 'free' || val === 'pro' || val === 'disabled') {
      result[def.id] = val
    }
  }
  return result
}

function ModulesContent({
  client,
  session
}: {
  client: AdminSupabaseClient
  session: AdminSession
}) {
  const [modulesMap, setModulesMap] = useState<AnalysisModulesMap>({
    ...DEFAULT_ANALYSIS_MODULES_MAP
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [previewModuleId, setPreviewModuleId] = useState<AnalysisModuleId>('architectureDiagram')

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const configsRes = await fetchRemoteConfigsMap(client)
    if (configsRes.error) {
      setLoadError(configsRes.error)
      setStatus({
        type: 'error',
        message: `Error al cargar módulos: ${configsRes.error}`
      })
      setLoading(false)
      return
    }

    const parsed = parseModulesMap(configsRes.data.analysis_modules)
    setModulesMap(parsed)
    setLoading(false)
  }, [client])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const stats = useMemo(() => {
    const total = DEFAULT_ANALYSIS_MODULES.length
    let freeCount = 0
    let proCount = 0
    let disabledCount = 0

    for (const def of DEFAULT_ANALYSIS_MODULES) {
      const access = modulesMap[def.id]
      if (access === 'free') freeCount++
      else if (access === 'pro') proCount++
      else if (access === 'disabled') disabledCount++
    }

    return { total, freeCount, proCount, disabledCount }
  }, [modulesMap])

  function handleSetAccess(id: AnalysisModuleId, access: ModuleAccessLevel) {
    setModulesMap((prev) => ({ ...prev, [id]: access }))
  }

  function applyPreset(preset: 'standard' | 'aggressive' | 'allFree') {
    if (preset === 'standard') {
      setModulesMap({ ...DEFAULT_ANALYSIS_MODULES_MAP })
    } else if (preset === 'aggressive') {
      const aggressive: AnalysisModulesMap = {
        summary: 'free',
        installCommand: 'pro',
        cloudSandbox: 'pro',
        hardwareCompat: 'pro',
        roadmap: 'pro',
        repoHealth: 'pro',
        architectureDiagram: 'pro',
        deepAudit: 'pro',
        fileTree: 'pro',
        dependencies: 'pro',
        mascotChat: 'pro',
        exportReport: 'pro'
      }
      setModulesMap(aggressive)
    } else if (preset === 'allFree') {
      const allFree: AnalysisModulesMap = {
        summary: 'free',
        installCommand: 'free',
        cloudSandbox: 'free',
        hardwareCompat: 'free',
        roadmap: 'free',
        repoHealth: 'free',
        architectureDiagram: 'free',
        deepAudit: 'free',
        fileTree: 'free',
        dependencies: 'free',
        mascotChat: 'free',
        exportReport: 'free'
      }
      setModulesMap(allFree)
    }
  }

  async function handleSaveAll() {
    if (loadError) return
    setSaving(true)
    setStatus(null)

    const res = await dispatchServerConfigSync(
      'analysis_modules',
      modulesMap,
      session.accessToken
    )
    setSaving(false)

    if (!res.success) {
      setStatus({ type: 'error', message: res.error ?? 'Error al sincronizar configuración de módulos' })
      return
    }

    setStatus({
      type: 'success',
      message: '¡Configuración de módulos de análisis guardada y sincronizada en vivo con Cloudflare KV!'
    })
  }

  const previewModule = DEFAULT_ANALYSIS_MODULES.find((m) => m.id === previewModuleId)

  return (
    <div className="space-y-6">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Total de Módulos"
          value={stats.total}
          hint="Módulos de análisis configurables"
          accent="indigo"
          icon={<Boxes className="w-4 h-4 text-indigo-400" />}
        />
        <KpiCard
          label="Módulos Gratuitos (Free)"
          value={stats.freeCount}
          hint="Disponibles para todos los usuarios"
          accent="emerald"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
        />
        <KpiCard
          label="Módulos Exclusivos (Pro Only)"
          value={stats.proCount}
          hint="Bloqueados con invitación a suscribirse"
          accent="sky"
          icon={<Lock className="w-4 h-4 text-sky-400" />}
        />
        <KpiCard
          label="Módulos Desactivados"
          value={stats.disabledCount}
          hint="Ocultos totalmente en la extensión"
          accent="amber"
          icon={<ShieldAlert className="w-4 h-4 text-amber-400" />}
        />
      </div>

      {/* Preset Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-white flex items-center gap-2">
            <span>Plantillas de Monetización Rápidas</span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">
              analysis_modules
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Aplica combinaciones recomendadas de acceso Free vs Pro con un solo clic.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => applyPreset('standard')}
            className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition"
          >
            Plan Estándar (Recomendado)
          </button>
          <button
            type="button"
            onClick={() => applyPreset('aggressive')}
            className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-1.5 text-xs font-medium text-indigo-300 transition"
          >
            Freemium Agresivo
          </button>
          <button
            type="button"
            onClick={() => applyPreset('allFree')}
            className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition"
          >
            Todo Gratuito
          </button>
          <button
            type="button"
            onClick={() => void handleSaveAll()}
            disabled={saving || loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-1.5 text-xs font-semibold text-white transition shadow-sm ml-2"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Guardando...' : 'Guardar y Sincronizar KV'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Modules List */}
        <div className="lg:col-span-2 space-y-3">
          {DEFAULT_ANALYSIS_MODULES.map((mod) => {
            const currentAccess = modulesMap[mod.id]
            const isSelectedForPreview = previewModuleId === mod.id

            return (
              <div
                key={mod.id}
                onClick={() => setPreviewModuleId(mod.id)}
                className={`rounded-xl border p-4 transition-all cursor-pointer ${
                  isSelectedForPreview
                    ? 'border-indigo-500 bg-slate-900/90 shadow-md ring-1 ring-indigo-500/50'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 p-2 rounded-lg bg-slate-900 border border-slate-800">
                      {MODULE_ICONS[mod.id]}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{mod.name}</span>
                        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                          {mod.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{mod.description}</p>
                    </div>
                  </div>

                  {/* 3-State Access Pill Toggle */}
                  <div
                    className="flex items-center rounded-lg border border-slate-800 bg-slate-900/90 p-1 shrink-0 self-end sm:self-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => handleSetAccess(mod.id, 'free')}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                        currentAccess === 'free'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Free (Todos)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetAccess(mod.id, 'pro')}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1 ${
                        currentAccess === 'pro'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Lock className="w-3 h-3" />
                      Pro Only
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetAccess(mod.id, 'disabled')}
                      className={`px-2 py-1 rounded-md text-xs font-semibold transition ${
                        currentAccess === 'disabled'
                          ? 'bg-rose-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Desactivar
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Right Col: Live Pro Gate Preview */}
        <div className="space-y-4">
          <SectionCard
            title="Vista Previa para Usuario Free"
            description="Así es como un usuario gratuito verá el módulo en el sidepanel cuando esté configurado como Pro Only:"
          >
            {previewModule && (
              <div className="rounded-xl border border-sky-400/30 bg-gradient-to-br from-sky-500/10 via-indigo-500/10 to-purple-500/10 p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
                      <Lock className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-bold text-white tracking-tight">
                      {previewModule.name}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-widest bg-gradient-to-r from-sky-400 to-indigo-500 text-slate-950 uppercase shadow-sm">
                    PRO
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Esta funcionalidad de análisis avanzado requiere una suscripción activa a{' '}
                  <strong className="text-white">GitHub Intelligence Pro</strong>.
                  Desbloquea auditorías completas, diagramas Mermaid interactivos y consultas ilimitadas.
                </p>

                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 py-2.5 px-4 text-xs font-bold text-white shadow-lg transition active:scale-[0.98]"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Desbloquear con Pro
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      className="text-[11px] text-slate-400 hover:text-slate-200 underline"
                    >
                      ¿Ya te suscribiste? Actualizar estado
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400 space-y-1 mt-4">
              <div className="font-medium text-slate-300 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-indigo-400" />
                <span>Comportamiento del Sistema:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-400">
                <li>
                  <strong>Free (Todos):</strong> Visible para cualquier usuario sin restricciones.
                </li>
                <li>
                  <strong>Pro Only:</strong> Muestra la tarjeta de suscripción y oculta los datos de la IA para usuarios Free.
                </li>
                <li>
                  <strong>Desactivado:</strong> Se omite por completo de la interfaz para todos.
                </li>
              </ul>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

export default function AnalysisModulesPage() {
  return (
    <AdminShell
      activeRoute="/modules"
      title="Módulos de Análisis (Free vs Pro)"
      subtitle="Activa, desactiva o restringe módulos específicos para forzar la conversión de usuarios Free a Pro."
    >
      {({ client, session }) => <ModulesContent client={client} session={session} />}
    </AdminShell>
  )
}
